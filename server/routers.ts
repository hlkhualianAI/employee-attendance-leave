import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  isValidCoordinate,
  isWithinOfficeGeofence,
  OFFICE_LOCATION,
} from "./location.logic";
import {
  checkInEmployee,
  checkOutEmployee,
  createEmployee,
  deleteEmployee,
  createLeaveRequest,
  getAttendanceByDate,
  getAttendanceByMonth,
  getAttendanceByRange,
  getDashboardSummary,
  getDashboardSummaryByRange,
  getEmployeeByUserId,
  getEmployees,
  getLeaveRequests,
  getLeaveRequestsByMonth,
  getLeaveRequestsByRange,
  getLocalUserByIdentifier,
  getRecentAttendance,
  updateAttendanceTime,
  getUserById,
  getUsers,
  ensurePrimaryAdmin,
  markLocalUserSignedIn,
  bindEmployeeDevice,
  linkEmployeeUser,
  updateLeaveStatus,
  updateEmployee,
  updateUserRole,
  updateLocalUserPin,
} from "./db";
import { countWeekdays, getBangkokDate } from "./attendance.logic";
import { createSessionToken, verifyPin } from "./local-auth";
import { getLocalAuthSecret, SESSION_COOKIE } from "./_core/context";
import { serialize } from "cookie";
import { notifyLateCheckIn, notifyLeaveCreated, notifyLeaveStatus } from "./line-notify";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง");
const roleSchema = z.enum(["admin", "hr", "employee"]);
type EffectiveRole = z.infer<typeof roleSchema>;

function effectiveRole(role: string): EffectiveRole {
  if (role === "admin") return "admin";
  if (role === "hr") return "hr";
  return "employee";
}

function roleProcedure(roles: EffectiveRole[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    const role = effectiveRole(ctx.user.role);
    if (!roles.includes(role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "คุณไม่มีสิทธิ์ดำเนินการนี้",
      });
    }
    return next({ ctx: { ...ctx, user: { ...ctx.user, role } } });
  });
}

const peopleOpsProcedure = roleProcedure(["admin", "hr"]);
const staffProcedure = roleProcedure(["admin", "hr", "employee"]);
const adminProcedure = roleProcedure(["admin"]);

async function assertEmployeeAccess(
  employeeId: number,
  userId: number,
  role: EffectiveRole
) {
  if (role === "admin" || role === "hr") return;
  const employee = await getEmployeeByUserId(userId);
  if (!employee || employee.id !== employeeId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "พนักงานทั่วไปเข้าถึงได้เฉพาะข้อมูลของตนเอง",
    });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(z.object({ identifier: z.string().email().max(160), pin: z.string().min(4).max(128) }))
      .mutation(async ({ input, ctx }) => {
        await ensurePrimaryAdmin();
        const account = await getLocalUserByIdentifier(input.identifier);
        if (!account || !verifyPin(input.pin, String(account.pinHash ?? ""))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "รหัสพนักงานหรือ PIN ไม่ถูกต้อง" });
        }
        await markLocalUserSignedIn(account.id);
        ctx.res.setHeader("Set-Cookie", serialize(SESSION_COOKIE, createSessionToken(account.id, getLocalAuthSecret()), {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        }));
        return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      if (typeof ctx.res.setHeader === "function") {
        ctx.res.setHeader("Set-Cookie", serialize(SESSION_COOKIE, "", {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 0,
        }));
      }
      return { success: true } as const;
    }),
    setPin: protectedProcedure
      .input(z.object({ userId: z.number().int().positive().optional(), pin: z.string().min(4).max(128) }))
      .mutation(({ input, ctx }) => {
        const targetId = input.userId ?? ctx.user.id;
        if (targetId !== ctx.user.id && effectiveRole(ctx.user.role) !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะ Admin เท่านั้นที่ตั้ง PIN ให้บัญชีอื่นได้" });
        }
        return updateLocalUserPin(targetId, input.pin);
      }),
  }),
  users: router({
    list: adminProcedure.query(() => getUsers()),
    updateRole: adminProcedure
      .input(z.object({ id: z.number().int().positive(), role: roleSchema }))
      .mutation(({ input, ctx }) => {
        if (input.id === ctx.user.id && input.role !== "admin") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ไม่สามารถลดสิทธิ์บัญชีของตัวเองได้",
          });
        }
        return updateUserRole(input.id, input.role);
      }),
  }),
  employees: router({
    list: staffProcedure.query(({ ctx }) =>
      ctx.user.role === "employee" ? getEmployees(ctx.user.id) : getEmployees()
    ),
    create: peopleOpsProcedure
      .input(
        z.object({
          employeeCode: z.string().min(1).max(32),
          fullName: z.string().min(1).max(160),
          department: z.string().min(1).max(120),
          position: z.string().min(1).max(120),
          startDate: dateString,
          workStartMin: z.number().int().min(0).max(1439).optional(),
          workEndMin: z.number().int().min(0).max(1439).optional(),
          userId: z.number().int().positive().optional(),
          email: z.string().email().max(160),
          pin: z.string().min(4).max(128),
        })
      )
      .mutation(({ input }) => createEmployee(input)),
    update: peopleOpsProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          employeeCode: z.string().min(1).max(32),
          fullName: z.string().min(1).max(160),
          department: z.string().min(1).max(120),
          position: z.string().min(1).max(120),
          startDate: dateString,
          workStartMin: z.number().int().min(0).max(1439).optional(),
          workEndMin: z.number().int().min(0).max(1439).optional(),
        })
      )
      .mutation(({ input }) => updateEmployee(input)),
    delete: peopleOpsProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => deleteEmployee(input.id)),
    linkUser: peopleOpsProcedure
      .input(
        z.object({
          employeeId: z.number().int().positive(),
          userId: z.number().int().positive().nullable(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.userId !== null) {
          const account = await getUserById(input.userId);
          const accountRole = effectiveRole(account?.role ?? "employee");
          if (accountRole !== "employee") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "เชื่อมได้เฉพาะบัญชีพนักงานทั่วไป",
            });
          }
        }
        return linkEmployeeUser(input.employeeId, input.userId);
      }),
    resetDevice: peopleOpsProcedure
      .input(z.object({ employeeId: z.number().int().positive() }))
      .mutation(({ input }) => bindEmployeeDevice(input.employeeId, null)),
  }),
  attendance: router({
    summary: staffProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ input, ctx }) =>
        getDashboardSummary(
          input.month,
          ctx.user.role === "employee" ? ctx.user.id : undefined
        )
      ),
    recent: staffProcedure.query(({ ctx }) =>
      getRecentAttendance(
        8,
        ctx.user.role === "employee" ? ctx.user.id : undefined
      )
    ),
    byDate: staffProcedure
      .input(z.object({ workDate: dateString }))
      .query(({ input, ctx }) =>
        getAttendanceByDate(
          input.workDate,
          ctx.user.role === "employee" ? ctx.user.id : undefined
        )
      ),
    exportMonth: staffProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ input, ctx }) =>
        Promise.all([
          getAttendanceByMonth(
            input.month,
            ctx.user.role === "employee" ? ctx.user.id : undefined
          ),
          getLeaveRequestsByMonth(
            input.month,
            ctx.user.role === "employee" ? ctx.user.id : undefined
          ),
          getDashboardSummary(
            input.month,
            ctx.user.role === "employee" ? ctx.user.id : undefined
          ),
        ]).then(([attendanceRows, leaveRows, summary]) => ({
          attendance: attendanceRows,
          leave: leaveRows,
          summary,
        }))
      ),
    reportRange: staffProcedure
      .input(z.object({ startDate: dateString, endDate: dateString }))
      .query(({ input, ctx }) => {
        if (input.startDate > input.endDate)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ช่วงวันที่ไม่ถูกต้อง",
          });
        const userId = ctx.user.role === "employee" ? ctx.user.id : undefined;
        return Promise.all([
          getAttendanceByRange(input.startDate, input.endDate, userId),
          getLeaveRequestsByRange(input.startDate, input.endDate, userId),
          getDashboardSummaryByRange(input.startDate, input.endDate, userId),
        ]).then(([attendance, leave, summary]) => ({
          attendance,
          leave,
          summary,
        }));
      }),
    checkIn: staffProcedure
      .input(
        z.object({
          employeeId: z.number().int().positive(),
          checkInMode: z.enum(["office", "offsite"]),
          latitude: z.number().finite(),
          longitude: z.number().finite(),
          deviceId: z.string().min(16).max(128),
          note: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertEmployeeAccess(
          input.employeeId,
          ctx.user.id,
          ctx.user.role
        );
        if (!isValidCoordinate(input.latitude, input.longitude)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ไม่พบพิกัด GPS ที่ถูกต้อง กรุณาอนุญาตการเข้าถึงตำแหน่ง",
          });
        }
        if (input.checkInMode === "office") {
          const geofence = isWithinOfficeGeofence(
            input.latitude,
            input.longitude
          );
          if (!geofence.allowed) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `อยู่นอกพื้นที่เช็คอินสำนักงาน (ห่างประมาณ ${Math.round(geofence.distanceMeters)} เมตร / รัศมี ${OFFICE_LOCATION.radiusMeters} เมตร)`,
            });
          }
        } else if (!input.note?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "กรุณาระบุเหตุผลเมื่อเลือกทำงานต่างจังหวัด",
          });
        }
        if (ctx.user.role === "employee") {
          const employee = await getEmployeeByUserId(ctx.user.id);
          if (!employee)
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "บัญชียังไม่ได้ผูกกับโปรไฟล์พนักงาน",
            });
          if (employee.deviceId && employee.deviceId !== input.deviceId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "อุปกรณ์นี้ไม่ใช่อุปกรณ์ที่ผูกกับบัญชีพนักงาน",
            });
          }
          if (!employee.deviceId)
            await bindEmployeeDevice(employee.id, input.deviceId);
        }
        const checkInAt = Date.now();
        let result;
        try {
          result = await checkInEmployee(input.employeeId, getBangkokDate(), checkInAt, {
            checkInMode: input.checkInMode,
            latitude: input.latitude,
            longitude: input.longitude,
            deviceId: input.deviceId,
            recordedByUserId: ctx.user.id,
            note: input.note?.trim() || undefined,
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes("เช็คอินแล้ววันนี้")) {
            throw new TRPCError({ code: "CONFLICT", message: error.message });
          }
          throw error;
        }
        if (result.lateMinutes > 0) {
          const employee = (await getEmployees()).find(row => row.id === input.employeeId);
          if (employee) void notifyLateCheckIn(employee, getBangkokDate(), checkInAt, result.lateMinutes);
        }
        return result;
      }),
    checkOut: staffProcedure
      .input(z.object({ employeeId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        await assertEmployeeAccess(
          input.employeeId,
          ctx.user.id,
          ctx.user.role
        );
        return checkOutEmployee(input.employeeId, getBangkokDate(), Date.now());
      }),
    updateTime: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          checkInAt: z.number().int().nonnegative().nullable(),
          checkOutAt: z.number().int().nonnegative().nullable(),
          note: z.string().max(500).optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        updateAttendanceTime({ ...input, updatedByUserId: ctx.user.id })
      ),
  }),
  leave: router({
    list: staffProcedure.query(({ ctx }) =>
      getLeaveRequests(
        8,
        ctx.user.role === "employee" ? ctx.user.id : undefined
      )
    ),
    create: staffProcedure
      .input(
        z.object({
          employeeId: z.number().int().positive(),
          leaveType: z.enum(["annual", "sick", "personal", "other"]),
          startDate: dateString,
          endDate: dateString,
          totalDays: z.number().int().positive(),
          reason: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertEmployeeAccess(
          input.employeeId,
          ctx.user.id,
          ctx.user.role
        );
        const calculatedDays = countWeekdays(input.startDate, input.endDate);
        if (calculatedDays < 1 || input.totalDays !== calculatedDays) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "จำนวนวันลาหรือช่วงวันที่ไม่ถูกต้อง",
          });
        }
        const leave = await createLeaveRequest({ ...input, totalDays: calculatedDays });
        const employee = (await getEmployees()).find(row => row.id === input.employeeId);
        if (employee) void notifyLeaveCreated(employee, leave);
        return leave;
      }),
    updateStatus: peopleOpsProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["pending", "approved", "rejected"]),
        })
      )
      .mutation(async ({ input }) => {
        const existing = (await getLeaveRequests(1000)).find(row => row.id === input.id);
        const result = await updateLeaveStatus(input.id, input.status);
        if (existing && (input.status === "approved" || input.status === "rejected")) {
          void notifyLeaveStatus(existing, existing, input.status);
        }
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
