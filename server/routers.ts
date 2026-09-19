import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  checkInEmployee,
  checkOutEmployee,
  createEmployee,
  createLeaveRequest,
  getAttendanceByDate,
  getDashboardSummary,
  getEmployees,
  getLeaveRequests,
  getRecentAttendance,
  updateLeaveStatus,
} from "./db";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง");

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
  employees: router({
    list: protectedProcedure.query(() => getEmployees()),
    create: protectedProcedure
      .input(
        z.object({
          employeeCode: z.string().min(1).max(32),
          fullName: z.string().min(1).max(160),
          department: z.string().min(1).max(120),
          position: z.string().min(1).max(120),
          workStartMin: z.number().int().min(0).max(1439).optional(),
          workEndMin: z.number().int().min(0).max(1439).optional(),
        }),
      )
      .mutation(({ input }) => createEmployee(input)),
  }),
  attendance: router({
    summary: protectedProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input }) => getDashboardSummary(input.month)),
    recent: protectedProcedure.query(() => getRecentAttendance()),
    byDate: protectedProcedure.input(z.object({ workDate: dateString })).query(({ input }) => getAttendanceByDate(input.workDate)),
    checkIn: protectedProcedure
      .input(z.object({ employeeId: z.number().int().positive(), workDate: dateString, timestamp: z.number().int(), note: z.string().max(500).optional() }))
      .mutation(({ input }) => checkInEmployee(input.employeeId, input.workDate, input.timestamp, input.note)),
    checkOut: protectedProcedure
      .input(z.object({ employeeId: z.number().int().positive(), workDate: dateString, timestamp: z.number().int() }))
      .mutation(({ input }) => checkOutEmployee(input.employeeId, input.workDate, input.timestamp)),
  }),
  leave: router({
    list: protectedProcedure.query(() => getLeaveRequests()),
    create: protectedProcedure
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
      .mutation(({ input }) => createLeaveRequest(input)),
    updateStatus: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "approved", "rejected"]) }))
      .mutation(({ input }) => updateLeaveStatus(input.id, input.status)),
  }),
});

export type AppRouter = typeof appRouter;
