import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { isValidCoordinate, isWithinOfficeGeofence, OFFICE_LOCATION } from "./location.logic";
import {
  checkInEmployee,
  checkOutEmployee,
  createEmployee,
  createLeaveRequest,
  getAttendanceByDate,
  getDashboardSummary,
  getEmployeeByUserId,
  getEmployees,
  getLeaveRequests,
  getRecentAttendance,
  getUserById,
  getUsers,
  bindEmployeeDevice,
  linkEmployeeUser,
  updateLeaveStatus,
  updateUserRole,
} from "./db";
import { getBangkokDate } from "./attendance.logic";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง");
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
      throw new TRPCError({ code: "FORBIDDEN", message: "คุณไม่มีสิทธิ์ดำเนินการนี้" });
    }
    return next({ ctx: { ...ctx, user: { ...ctx.user, role } } });
  });
}

const peopleOpsProcedure = roleProcedure(["admin", "hr"]);
const staffProcedure = roleProcedure(["admin", "hr", "employee"]);
const adminProcedure = roleProcedure(["admin"]);

async function assertEmployeeAccess(employeeId: number, userId: number, role: EffectiveRole) {
  if (role === "admin" || role === "hr") return;
  const employee = await getEmployeeByUserId(userId);
  if (!employee || employee.id !== employeeId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "พนักงานทั่วไปเข้าถึงได้เฉพาะข้อมูลของตนเอง" });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  users: router({
    list: adminProcedure.query(() => getUsers()),
    updateRole: adminProcedure
      .input(z.object({ id: z.number().int().positive(), role: roleSchema }))
      .mutation(({ input, ctx }) => {
        if (input.id === ctx.user.id && input.role !== "admin") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถลดสิทธิ์บัญชีของตัวเองได้" });
        }
        return updateUserRole(input.id, input.role);
      }),
  }),
  employees: router({
    list: staffProcedure.query(({ ctx }) => (ctx.user.role === "employee" ? getEmployees(ctx.user.id) : getEmployees())),
    create: peopleOpsProcedure
      .input(
        z.object({
          employeeCode: z.string().min(1).max(32),
          fullName: z.string().min(1).max(160),
          department: z.string().min(1).max(120),
          position: z.string().min(1).max(120),
          workStartMin: z.number().int().min(0).max(1439).optional(),
          workEndMin: z.number().int().min(0).max(1439).optional(),
          userId: z.number().int().positive().optional(),
        }),
      )
      .mutation(({ input }) => createEmployee(input)),
    linkUser: peopleOpsProcedure
      .input(z.object({ employeeId: z.number().int().positive(), userId: z.number().int().positive().nullable() }))
      .mutation(async ({ input }) => {
        if (input.userId !== null) {
          const account = await getUserById(input.userId);
          const accountRole = effectiveRole(account?.role ?? "employee");
          if (accountRole !== "employee") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "เชื่อมได้เฉพาะบัญชีพนักงานทั่วไป" });
          }
        }
        return linkEmployeeUser(input.employeeId, input.userId);
      }),
    resetDevice: peopleOpsProcedure
      .input(z.object({ employeeId: z.number().int().positive() }))
      .mutation(({ input }) => bindEmployeeDevice(input.employeeId, null)),
  }),
  attendance: router({
    summary: staffProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input, ctx }) => getDashboardSummary(input.month, ctx.user.role === "employee" ? ctx.user.id : undefined)),
    recent: staffProcedure.query(({ ctx }) => getRecentAttendance(8, ctx.user.role === "employee" ? ctx.user.id : undefined)),
    byDate: staffProcedure.input(z.object({ workDate: dateString })).query(({ input, ctx }) => getAttendanceByDate(input.workDate, ctx.user.role === "employee" ? ctx.user.id : undefined)),
    checkIn: staffProcedure
      .input(z.object({ employeeId: z.number().int().positive(), checkInMode: z.enum(["office", "offsite"]), latitude: z.number().finite(), longitude: z.number().finite(), deviceId: z.string().min(16).max(128), note: z.string().max(500).optional() }))
      .mutation(async ({ input, ctx }) => {
        await assertEmployeeAccess(input.employeeId, ctx.user.id, ctx.user.role);
        if (!isValidCoordinate(input.latitude, input.longitude)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่พบพิกัด GPS ที่ถูกต้อง กรุณาอนุญาตการเข้าถึงตำแหน่ง" });
        }
        if (input.checkInMode === "office") {
          const geofence = isWithinOfficeGeofence(input.latitude, input.longitude);
          if (!geofence.allowed) {
            throw new TRPCError({ code: "FORBIDDEN", message: `อยู่นอกพื้นที่เช็คอินสำนักงาน (ห่างประมาณ ${Math.round(geofence.distanceMeters)} เมตร / รัศมี ${OFFICE_LOCATION.radiusMeters} เมตร)` });
          }
        } else if (!input.note?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "กรุณาระบุเหตุผลเมื่อเลือกทำงานต่างจังหวัด" });
        }
        if (ctx.user.role === "employee") {
          const employee = await getEmployeeByUserId(ctx.user.id);
          if (!employee) throw new TRPCError({ code: "FORBIDDEN", message: "บัญชียังไม่ได้ผูกกับโปรไฟล์พนักงาน" });
          if (employee.deviceId && employee.deviceId !== input.deviceId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "อุปกรณ์นี้ไม่ใช่อุปกรณ์ที่ผูกกับบัญชีพนักงาน" });
          }
          if (!employee.deviceId) await bindEmployeeDevice(employee.id, input.deviceId);
        }
        return checkInEmployee(input.employeeId, getBangkokDate(), Date.now(), { checkInMode: input.checkInMode, latitude: input.latitude, longitude: input.longitude, deviceId: input.deviceId, recordedByUserId: ctx.user.id, note: input.note?.trim() || undefined });
      }),
    checkOut: staffProcedure
      .input(z.object({ employeeId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        await assertEmployeeAccess(input.employeeId, ctx.user.id, ctx.user.role);
        return checkOutEmployee(input.employeeId, getBangkokDate(), Date.now());
      }),
  }),
  leave: router({
    list: staffProcedure.query(({ ctx }) => getLeaveRequests(8, ctx.user.role === "employee" ? ctx.user.id : undefined)),
    create: staffProcedure
      .input(
        z.object({
          employeeId: z.number().int().positive(),
          leaveType: z.enum(["annual", "sick", "personal", "other"]),
          startDate: dateString,
          endDate: dateString,
          totalDays: z.number().int().positive(),
          reason: z.string().max(1000).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await assertEmployeeAccess(input.employeeId, ctx.user.id, ctx.user.role);
        return createLeaveRequest(input);
      }),
    updateStatus: peopleOpsProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "approved", "rejected"]) }))
      .mutation(({ input }) => updateLeaveStatus(input.id, input.status)),
  }),
});

export type AppRouter = typeof appRouter;
