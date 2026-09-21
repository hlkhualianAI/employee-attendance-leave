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

type AppRole = "admin" | "hr" | "employee";

export async function getUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn })
    .from(users)
    .orderBy(users.name);
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserRole(id: number, role: AppRole) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
  return { id, role };
}

export async function getEmployees(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(employees)
    .where(userId === undefined ? undefined : eq(employees.userId, userId))
    .orderBy(employees.status, employees.fullName);
}

export async function getEmployeeByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return result[0];
}

export async function createEmployee(input: {
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  workStartMin?: number;
  workEndMin?: number;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const result = await db
    .insert(employees)
    .values({ ...input, workStartMin: input.workStartMin ?? 510, workEndMin: input.workEndMin ?? 1050, createdAt: now, updatedAt: now })
    .$returningId();
  return result[0];
}

export async function linkEmployeeUser(employeeId: number, userId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ userId, updatedAt: Date.now() }).where(eq(employees.id, employeeId));
  return { employeeId, userId };
}

export async function bindEmployeeDevice(employeeId: number, deviceId: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ deviceId, updatedAt: Date.now() }).where(eq(employees.id, employeeId));
  return { employeeId, deviceId };
}

function scopedCondition(condition: ReturnType<typeof eq>, userId?: number) {
  return userId === undefined ? condition : and(condition, eq(employees.userId, userId));
}

export async function getAttendanceByDate(workDate: string, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      recordedByUserId: attendance.recordedByUserId,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      department: employees.department,
      workDate: attendance.workDate,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      lateMinutes: attendance.lateMinutes,
      checkInMode: attendance.checkInMode,
      latitude: attendance.latitude,
      longitude: attendance.longitude,
      deviceId: attendance.deviceId,
      note: attendance.note,
    })
    .from(attendance)
    .innerJoin(employees, eq(attendance.employeeId, employees.id))
    .where(scopedCondition(eq(attendance.workDate, workDate), userId))
    .orderBy(desc(attendance.checkInAt));
}

export async function getRecentAttendance(limit = 8, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: attendance.id,
      recordedByUserId: attendance.recordedByUserId,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
      department: employees.department,
      workDate: attendance.workDate,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      lateMinutes: attendance.lateMinutes,
      checkInMode: attendance.checkInMode,
      latitude: attendance.latitude,
      longitude: attendance.longitude,
      deviceId: attendance.deviceId,
    })
    .from(attendance)
    .innerJoin(employees, eq(attendance.employeeId, employees.id))
    .where(userId === undefined ? undefined : eq(employees.userId, userId))
    .orderBy(desc(attendance.updatedAt))
    .limit(limit);
}

export async function getAttendanceByMonth(monthPrefix: string, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ employeeCode: employees.employeeCode, fullName: employees.fullName, department: employees.department, workDate: attendance.workDate, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt, lateMinutes: attendance.lateMinutes, checkInMode: attendance.checkInMode, note: attendance.note })
    .from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id))
    .where(userId === undefined ? like(attendance.workDate, `${monthPrefix}%`) : and(like(attendance.workDate, `${monthPrefix}%`), eq(employees.userId, userId)))
    .orderBy(attendance.workDate, employees.fullName);
}

export async function getLeaveRequests(limit = 8, userId?: number) {
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
    .where(userId === undefined ? undefined : eq(employees.userId, userId))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(limit);
}

export async function getLeaveRequestsByMonth(monthPrefix: string, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ employeeCode: employees.employeeCode, fullName: employees.fullName, department: employees.department, leaveType: leaveRequests.leaveType, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, totalDays: leaveRequests.totalDays, reason: leaveRequests.reason, status: leaveRequests.status })
    .from(leaveRequests).innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(userId === undefined ? like(leaveRequests.startDate, `${monthPrefix}%`) : and(like(leaveRequests.startDate, `${monthPrefix}%`), eq(employees.userId, userId)))
    .orderBy(leaveRequests.startDate, employees.fullName);
}

export async function getDashboardSummary(monthPrefix: string, userId?: number) {
  const db = await getDb();
  if (!db) {
    return { totalEmployees: 0, presentDays: 0, lateDays: 0, approvedLeaveDays: 0, pendingLeaves: 0 };
  }

  const [employeeRows, attendanceRows, leaveRows, pendingRows] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(employees).where(userId === undefined ? eq(employees.status, "active") : and(eq(employees.status, "active"), eq(employees.userId, userId))),
    db
      .select({
        present: sql<number>`count(*)`,
        late: sql<number>`coalesce(sum(case when ${attendance.lateMinutes} > 0 then 1 else 0 end), 0)`,
      })
      .from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .where(userId === undefined ? like(attendance.workDate, `${monthPrefix}%`) : and(like(attendance.workDate, `${monthPrefix}%`), eq(employees.userId, userId))),
    db
      .select({ value: sql<number>`coalesce(sum(${leaveRequests.totalDays}), 0)` })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(userId === undefined ? and(like(leaveRequests.startDate, `${monthPrefix}%`), eq(leaveRequests.status, "approved")) : and(like(leaveRequests.startDate, `${monthPrefix}%`), eq(leaveRequests.status, "approved"), eq(employees.userId, userId))),
    db
      .select({ value: sql<number>`count(*)` })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(userId === undefined ? eq(leaveRequests.status, "pending") : and(eq(leaveRequests.status, "pending"), eq(employees.userId, userId))),
  ]);

  return {
    totalEmployees: Number(employeeRows[0]?.value ?? 0),
    presentDays: Number(attendanceRows[0]?.present ?? 0),
    lateDays: Number(attendanceRows[0]?.late ?? 0),
    approvedLeaveDays: Number(leaveRows[0]?.value ?? 0),
    pendingLeaves: Number(pendingRows[0]?.value ?? 0),
  };
}

export async function checkInEmployee(
  employeeId: number,
  workDate: string,
  timestamp: number,
  input: { checkInMode: "office" | "offsite"; latitude: number; longitude: number; deviceId: string; recordedByUserId: number; note?: string },
) {
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
      .set({ checkInAt: timestamp, lateMinutes, checkInMode: input.checkInMode, latitude: input.latitude, longitude: input.longitude, deviceId: input.deviceId, recordedByUserId: input.recordedByUserId, note: input.note ?? existing[0].note, updatedAt: now })
      .where(eq(attendance.id, existing[0].id));
    return { id: existing[0].id, lateMinutes };
  }

  const result = await db.insert(attendance).values({ employeeId, workDate, checkInAt: timestamp, lateMinutes, ...input, createdAt: now, updatedAt: now }).$returningId();
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
