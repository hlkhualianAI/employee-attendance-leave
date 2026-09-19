import { and, desc, eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  attendance,
  employees,
  InsertUser,
  leaveRequests,
  users,
} from "../drizzle/schema";
import { calculateLateMinutes } from "./attendance.logic";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };

  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getEmployees() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employees).orderBy(employees.status, employees.fullName);
}

export async function createEmployee(input: {
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  workStartMin?: number;
  workEndMin?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const result = await db
    .insert(employees)
    .values({ ...input, workStartMin: input.workStartMin ?? 540, workEndMin: input.workEndMin ?? 1080, createdAt: now, updatedAt: now })
    .$returningId();
  return result[0];
}

export async function getAttendanceByDate(workDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      department: employees.department,
      workDate: attendance.workDate,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      lateMinutes: attendance.lateMinutes,
      note: attendance.note,
    })
    .from(attendance)
    .innerJoin(employees, eq(attendance.employeeId, employees.id))
    .where(eq(attendance.workDate, workDate))
    .orderBy(desc(attendance.checkInAt));
}

export async function getRecentAttendance(limit = 8) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: attendance.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
      department: employees.department,
      workDate: attendance.workDate,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      lateMinutes: attendance.lateMinutes,
    })
    .from(attendance)
    .innerJoin(employees, eq(attendance.employeeId, employees.id))
    .orderBy(desc(attendance.updatedAt))
    .limit(limit);
}

export async function getLeaveRequests(limit = 8) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
      department: employees.department,
      leaveType: leaveRequests.leaveType,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      totalDays: leaveRequests.totalDays,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(limit);
}

export async function getDashboardSummary(monthPrefix: string) {
  const db = await getDb();
  if (!db) {
    return { totalEmployees: 0, presentDays: 0, lateDays: 0, approvedLeaveDays: 0, pendingLeaves: 0 };
  }

  const [employeeRows, attendanceRows, leaveRows, pendingRows] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(employees).where(eq(employees.status, "active")),
    db
      .select({
        present: sql<number>`count(*)`,
        late: sql<number>`coalesce(sum(case when ${attendance.lateMinutes} > 0 then 1 else 0 end), 0)`,
      })
      .from(attendance)
      .where(like(attendance.workDate, `${monthPrefix}%`)),
    db
      .select({ value: sql<number>`coalesce(sum(${leaveRequests.totalDays}), 0)` })
      .from(leaveRequests)
      .where(and(like(leaveRequests.startDate, `${monthPrefix}%`), eq(leaveRequests.status, "approved"))),
    db.select({ value: sql<number>`count(*)` }).from(leaveRequests).where(eq(leaveRequests.status, "pending")),
  ]);

  return {
    totalEmployees: Number(employeeRows[0]?.value ?? 0),
    presentDays: Number(attendanceRows[0]?.present ?? 0),
    lateDays: Number(attendanceRows[0]?.late ?? 0),
    approvedLeaveDays: Number(leaveRows[0]?.value ?? 0),
    pendingLeaves: Number(pendingRows[0]?.value ?? 0),
  };
}

export async function checkInEmployee(employeeId: number, workDate: string, timestamp: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee[0]) throw new Error("ไม่พบข้อมูลพนักงาน");

  const existing = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.employeeId, employeeId), eq(attendance.workDate, workDate)))
    .limit(1);
  const lateMinutes = calculateLateMinutes(timestamp, employee[0].workStartMin);
  const now = Date.now();

  if (existing[0]) {
    await db
      .update(attendance)
      .set({ checkInAt: timestamp, lateMinutes, note: note ?? existing[0].note, updatedAt: now })
      .where(eq(attendance.id, existing[0].id));
    return { id: existing[0].id, lateMinutes };
  }

  const result = await db.insert(attendance).values({ employeeId, workDate, checkInAt: timestamp, lateMinutes, note, createdAt: now, updatedAt: now }).$returningId();
  return { id: result[0]?.id, lateMinutes };
}

export async function checkOutEmployee(employeeId: number, workDate: string, timestamp: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.employeeId, employeeId), eq(attendance.workDate, workDate)))
    .limit(1);
  if (!existing[0]) throw new Error("ยังไม่มีรายการเช็คอินของวันนี้");

  await db.update(attendance).set({ checkOutAt: timestamp, updatedAt: Date.now() }).where(eq(attendance.id, existing[0].id));
  return { id: existing[0].id };
}

export async function createLeaveRequest(input: {
  employeeId: number;
  leaveType: "annual" | "sick" | "personal" | "other";
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const result = await db.insert(leaveRequests).values({ ...input, createdAt: now, updatedAt: now }).$returningId();
  return result[0];
}

export async function updateLeaveStatus(id: number, status: "pending" | "approved" | "rejected") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leaveRequests).set({ status, updatedAt: Date.now() }).where(eq(leaveRequests.id, id));
  return { id, status };
}
