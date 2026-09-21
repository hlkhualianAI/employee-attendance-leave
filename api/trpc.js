var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/firebase.ts
var firebase_exports = {};
__export(firebase_exports, {
  getFirebaseAuth: () => getFirebaseAuth,
  getFirebaseProjectId: () => getFirebaseProjectId,
  getFirestoreDb: () => getFirestoreDb,
  verifyFirebaseIdToken: () => verifyFirebaseIdToken
});
import { createRemoteJWKSet, jwtVerify } from "jose";
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Firebase environment variable: ${name}`);
  return value;
}
async function getFirebaseApp() {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;
  return initializeApp({
    credential: cert({
      projectId: requiredEnv("FIREBASE_PROJECT_ID"),
      clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n")
    })
  });
}
async function getFirestoreDb() {
  if (!firestore) {
    const { getFirestore } = await import("firebase-admin/firestore");
    firestore = getFirestore(await getFirebaseApp());
  }
  return firestore;
}
async function getFirebaseAuth() {
  if (!firebaseAuth) {
    const { getAuth } = await import("firebase-admin/auth");
    firebaseAuth = getAuth(await getFirebaseApp());
  }
  return firebaseAuth;
}
async function verifyFirebaseIdToken(token) {
  const projectId = getFirebaseProjectId();
  const { payload } = await jwtVerify(token, firebaseTokenKeys, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId
  });
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Firebase ID token has no subject");
  }
  const uid = typeof payload.user_id === "string" ? payload.user_id : payload.sub;
  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : void 0,
    name: typeof payload.name === "string" ? payload.name : void 0
  };
}
function getFirebaseProjectId() {
  return requiredEnv("FIREBASE_PROJECT_ID");
}
var firebaseTokenKeys, firestore, firebaseAuth;
var init_firebase = __esm({
  "server/firebase.ts"() {
    "use strict";
    firebaseTokenKeys = createRemoteJWKSet(
      new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
    );
  }
});

// serverless/trpc.ts
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/routers.ts
import { TRPCError as TRPCError2 } from "@trpc/server";
import { z as z2 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// shared/const.ts
var UNAUTHED_ERR_MSG = "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A (10001)";
var NOT_ADMIN_ERR_MSG = "\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A (10002)";

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") })).query(() => ({ ok: true }))
});

// server/location.logic.ts
var OFFICE_LOCATION = {
  latitude: 16.3974363,
  longitude: 102.8603072,
  radiusMeters: 150
};
var EARTH_RADIUS_METERS = 6371e3;
function toRadians(value) {
  return value * Math.PI / 180;
}
function calculateDistanceMeters(from, to) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function isWithinOfficeGeofence(latitude, longitude, radiusMeters = OFFICE_LOCATION.radiusMeters) {
  const distanceMeters = calculateDistanceMeters(
    { latitude, longitude },
    { latitude: OFFICE_LOCATION.latitude, longitude: OFFICE_LOCATION.longitude }
  );
  return { allowed: distanceMeters <= radiusMeters, distanceMeters };
}
function isValidCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

// server/db.ts
import { and, desc, eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { bigint, double, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "hr", "employee"]).default("employee").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var employees = mysqlTable(
  "employees",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    /** Browser device token bound on the first employee self-check-in. */
    deviceId: varchar("deviceId", { length: 128 }),
    employeeCode: varchar("employeeCode", { length: 32 }).notNull().unique(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    department: varchar("department", { length: 120 }).notNull(),
    position: varchar("position", { length: 120 }).notNull(),
    workStartMin: int("workStartMin").default(510).notNull(),
    workEndMin: int("workEndMin").default(1050).notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull()
  },
  (table) => ({
    userIdx: index("employees_user_idx").on(table.userId),
    departmentIdx: index("employees_department_idx").on(table.department),
    statusIdx: index("employees_status_idx").on(table.status)
  })
);
var attendance = mysqlTable(
  "attendance",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employeeId").notNull(),
    recordedByUserId: int("recordedByUserId"),
    workDate: varchar("workDate", { length: 10 }).notNull(),
    checkInAt: bigint("checkInAt", { mode: "number" }),
    checkOutAt: bigint("checkOutAt", { mode: "number" }),
    lateMinutes: int("lateMinutes").default(0).notNull(),
    checkInMode: mysqlEnum("checkInMode", ["office", "offsite"]).default("office").notNull(),
    latitude: double("latitude"),
    longitude: double("longitude"),
    deviceId: varchar("deviceId", { length: 128 }),
    note: text("note"),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull()
  },
  (table) => ({
    employeeDateIdx: index("attendance_employee_date_idx").on(table.employeeId, table.workDate),
    dateIdx: index("attendance_date_idx").on(table.workDate)
  })
);
var leaveRequests = mysqlTable(
  "leaveRequests",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employeeId").notNull(),
    leaveType: mysqlEnum("leaveType", ["annual", "sick", "personal", "other"]).notNull(),
    startDate: varchar("startDate", { length: 10 }).notNull(),
    endDate: varchar("endDate", { length: 10 }).notNull(),
    totalDays: int("totalDays").notNull(),
    reason: text("reason"),
    status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull()
  },
  (table) => ({
    employeeIdx: index("leave_employee_idx").on(table.employeeId),
    statusIdx: index("leave_status_idx").on(table.status),
    dateIdx: index("leave_date_idx").on(table.startDate, table.endDate)
  })
);

// server/attendance.logic.ts
function getBangkokMinutes(timestamp2) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(timestamp2));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
function getBangkokDate(timestamp2 = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(timestamp2));
}
function calculateLateMinutes(timestamp2, workStartMin) {
  return Math.max(0, getBangkokMinutes(timestamp2) - workStartMin);
}
function countWeekdays(startDate, endDate) {
  const parseDate = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 864e5) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  const assignNullable = (field) => {
    const value = user[field];
    if (value === void 0) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn }).from(users).orderBy(users.name);
}
async function getUserById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}
async function updateUserRole(id, role) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id));
  return { id, role };
}
async function getEmployees(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employees).where(userId === void 0 ? void 0 : eq(employees.userId, userId)).orderBy(employees.status, employees.fullName);
}
async function getEmployeeByUserId(userId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return result[0];
}
async function createEmployee(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const result = await db.insert(employees).values({ ...input, workStartMin: input.workStartMin ?? 510, workEndMin: input.workEndMin ?? 1050, createdAt: now, updatedAt: now }).$returningId();
  return result[0];
}
async function linkEmployeeUser(employeeId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ userId, updatedAt: Date.now() }).where(eq(employees.id, employeeId));
  return { employeeId, userId };
}
async function bindEmployeeDevice(employeeId, deviceId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ deviceId, updatedAt: Date.now() }).where(eq(employees.id, employeeId));
  return { employeeId, deviceId };
}
function scopedCondition(condition, userId) {
  return userId === void 0 ? condition : and(condition, eq(employees.userId, userId));
}
async function getAttendanceByDate(workDate, userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
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
    note: attendance.note
  }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id)).where(scopedCondition(eq(attendance.workDate, workDate), userId)).orderBy(desc(attendance.checkInAt));
}
async function getRecentAttendance(limit = 8, userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
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
    deviceId: attendance.deviceId
  }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id)).where(userId === void 0 ? void 0 : eq(employees.userId, userId)).orderBy(desc(attendance.updatedAt)).limit(limit);
}
async function getAttendanceByMonth(monthPrefix, userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ employeeCode: employees.employeeCode, fullName: employees.fullName, department: employees.department, workDate: attendance.workDate, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt, lateMinutes: attendance.lateMinutes, checkInMode: attendance.checkInMode, note: attendance.note }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id)).where(userId === void 0 ? like(attendance.workDate, `${monthPrefix}%`) : and(like(attendance.workDate, `${monthPrefix}%`), eq(employees.userId, userId))).orderBy(attendance.workDate, employees.fullName);
}
async function getLeaveRequests(limit = 8, userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
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
    createdAt: leaveRequests.createdAt
  }).from(leaveRequests).innerJoin(employees, eq(leaveRequests.employeeId, employees.id)).where(userId === void 0 ? void 0 : eq(employees.userId, userId)).orderBy(desc(leaveRequests.createdAt)).limit(limit);
}
async function getLeaveRequestsByMonth(monthPrefix, userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ employeeCode: employees.employeeCode, fullName: employees.fullName, department: employees.department, leaveType: leaveRequests.leaveType, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, totalDays: leaveRequests.totalDays, reason: leaveRequests.reason, status: leaveRequests.status }).from(leaveRequests).innerJoin(employees, eq(leaveRequests.employeeId, employees.id)).where(userId === void 0 ? like(leaveRequests.startDate, `${monthPrefix}%`) : and(like(leaveRequests.startDate, `${monthPrefix}%`), eq(employees.userId, userId))).orderBy(leaveRequests.startDate, employees.fullName);
}
async function getDashboardSummary(monthPrefix, userId) {
  const db = await getDb();
  if (!db) {
    return { totalEmployees: 0, presentDays: 0, lateDays: 0, approvedLeaveDays: 0, pendingLeaves: 0 };
  }
  const [employeeRows, attendanceRows, leaveRows, pendingRows] = await Promise.all([
    db.select({ value: sql`count(*)` }).from(employees).where(userId === void 0 ? eq(employees.status, "active") : and(eq(employees.status, "active"), eq(employees.userId, userId))),
    db.select({
      present: sql`count(*)`,
      late: sql`coalesce(sum(case when ${attendance.lateMinutes} > 0 then 1 else 0 end), 0)`
    }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id)).where(userId === void 0 ? like(attendance.workDate, `${monthPrefix}%`) : and(like(attendance.workDate, `${monthPrefix}%`), eq(employees.userId, userId))),
    db.select({ value: sql`coalesce(sum(${leaveRequests.totalDays}), 0)` }).from(leaveRequests).innerJoin(employees, eq(leaveRequests.employeeId, employees.id)).where(userId === void 0 ? and(like(leaveRequests.startDate, `${monthPrefix}%`), eq(leaveRequests.status, "approved")) : and(like(leaveRequests.startDate, `${monthPrefix}%`), eq(leaveRequests.status, "approved"), eq(employees.userId, userId))),
    db.select({ value: sql`count(*)` }).from(leaveRequests).innerJoin(employees, eq(leaveRequests.employeeId, employees.id)).where(userId === void 0 ? eq(leaveRequests.status, "pending") : and(eq(leaveRequests.status, "pending"), eq(employees.userId, userId)))
  ]);
  return {
    totalEmployees: Number(employeeRows[0]?.value ?? 0),
    presentDays: Number(attendanceRows[0]?.present ?? 0),
    lateDays: Number(attendanceRows[0]?.late ?? 0),
    approvedLeaveDays: Number(leaveRows[0]?.value ?? 0),
    pendingLeaves: Number(pendingRows[0]?.value ?? 0)
  };
}
async function checkInEmployee(employeeId, workDate, timestamp2, input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee[0]) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19");
  const existing = await db.select().from(attendance).where(and(eq(attendance.employeeId, employeeId), eq(attendance.workDate, workDate))).limit(1);
  const lateMinutes = calculateLateMinutes(timestamp2, employee[0].workStartMin);
  const now = Date.now();
  if (existing[0]) {
    await db.update(attendance).set({ checkInAt: timestamp2, lateMinutes, checkInMode: input.checkInMode, latitude: input.latitude, longitude: input.longitude, deviceId: input.deviceId, recordedByUserId: input.recordedByUserId, note: input.note ?? existing[0].note, updatedAt: now }).where(eq(attendance.id, existing[0].id));
    return { id: existing[0].id, lateMinutes };
  }
  const result = await db.insert(attendance).values({ employeeId, workDate, checkInAt: timestamp2, lateMinutes, ...input, createdAt: now, updatedAt: now }).$returningId();
  return { id: result[0]?.id, lateMinutes };
}
async function checkOutEmployee(employeeId, workDate, timestamp2) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(attendance).where(and(eq(attendance.employeeId, employeeId), eq(attendance.workDate, workDate))).limit(1);
  if (!existing[0]) throw new Error("\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E47\u0E04\u0E2D\u0E34\u0E19\u0E02\u0E2D\u0E07\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49");
  await db.update(attendance).set({ checkOutAt: timestamp2, updatedAt: Date.now() }).where(eq(attendance.id, existing[0].id));
  return { id: existing[0].id };
}
async function createLeaveRequest(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const result = await db.insert(leaveRequests).values({ ...input, createdAt: now, updatedAt: now }).$returningId();
  return result[0];
}
async function updateLeaveStatus(id, status) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leaveRequests).set({ status, updatedAt: Date.now() }).where(eq(leaveRequests.id, id));
  return { id, status };
}

// server/routers.ts
var dateString = z2.string().regex(/^\d{4}-\d{2}-\d{2}$/, "\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07");
var roleSchema = z2.enum(["admin", "hr", "employee"]);
function effectiveRole(role) {
  if (role === "admin") return "admin";
  if (role === "hr") return "hr";
  return "employee";
}
function roleProcedure(roles) {
  return protectedProcedure.use(({ ctx, next }) => {
    const role = effectiveRole(ctx.user.role);
    if (!roles.includes(role)) {
      throw new TRPCError2({
        code: "FORBIDDEN",
        message: "\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49"
      });
    }
    return next({ ctx: { ...ctx, user: { ...ctx.user, role } } });
  });
}
var peopleOpsProcedure = roleProcedure(["admin", "hr"]);
var staffProcedure = roleProcedure(["admin", "hr", "employee"]);
var adminProcedure2 = roleProcedure(["admin"]);
async function assertEmployeeAccess(employeeId, userId, role) {
  if (role === "admin" || role === "hr") return;
  const employee = await getEmployeeByUserId(userId);
  if (!employee || employee.id !== employeeId) {
    throw new TRPCError2({
      code: "FORBIDDEN",
      message: "\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E2D\u0E07\u0E15\u0E19\u0E40\u0E2D\u0E07"
    });
  }
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(() => ({ success: true }))
  }),
  users: router({
    list: adminProcedure2.query(() => getUsers()),
    updateRole: adminProcedure2.input(z2.object({ id: z2.number().int().positive(), role: roleSchema })).mutation(({ input, ctx }) => {
      if (input.id === ctx.user.id && input.role !== "admin") {
        throw new TRPCError2({
          code: "BAD_REQUEST",
          message: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E25\u0E14\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E02\u0E2D\u0E07\u0E15\u0E31\u0E27\u0E40\u0E2D\u0E07\u0E44\u0E14\u0E49"
        });
      }
      return updateUserRole(input.id, input.role);
    })
  }),
  employees: router({
    list: staffProcedure.query(
      ({ ctx }) => ctx.user.role === "employee" ? getEmployees(ctx.user.id) : getEmployees()
    ),
    create: peopleOpsProcedure.input(
      z2.object({
        employeeCode: z2.string().min(1).max(32),
        fullName: z2.string().min(1).max(160),
        department: z2.string().min(1).max(120),
        position: z2.string().min(1).max(120),
        workStartMin: z2.number().int().min(0).max(1439).optional(),
        workEndMin: z2.number().int().min(0).max(1439).optional(),
        userId: z2.number().int().positive().optional()
      })
    ).mutation(({ input }) => createEmployee(input)),
    linkUser: peopleOpsProcedure.input(
      z2.object({
        employeeId: z2.number().int().positive(),
        userId: z2.number().int().positive().nullable()
      })
    ).mutation(async ({ input }) => {
      if (input.userId !== null) {
        const account = await getUserById(input.userId);
        const accountRole = effectiveRole(account?.role ?? "employee");
        if (accountRole !== "employee") {
          throw new TRPCError2({
            code: "BAD_REQUEST",
            message: "\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B"
          });
        }
      }
      return linkEmployeeUser(input.employeeId, input.userId);
    }),
    resetDevice: peopleOpsProcedure.input(z2.object({ employeeId: z2.number().int().positive() })).mutation(({ input }) => bindEmployeeDevice(input.employeeId, null))
  }),
  attendance: router({
    summary: staffProcedure.input(z2.object({ month: z2.string().regex(/^\d{4}-\d{2}$/) })).query(
      ({ input, ctx }) => getDashboardSummary(
        input.month,
        ctx.user.role === "employee" ? ctx.user.id : void 0
      )
    ),
    recent: staffProcedure.query(
      ({ ctx }) => getRecentAttendance(
        8,
        ctx.user.role === "employee" ? ctx.user.id : void 0
      )
    ),
    byDate: staffProcedure.input(z2.object({ workDate: dateString })).query(
      ({ input, ctx }) => getAttendanceByDate(
        input.workDate,
        ctx.user.role === "employee" ? ctx.user.id : void 0
      )
    ),
    exportMonth: staffProcedure.input(z2.object({ month: z2.string().regex(/^\d{4}-\d{2}$/) })).query(
      ({ input, ctx }) => Promise.all([
        getAttendanceByMonth(
          input.month,
          ctx.user.role === "employee" ? ctx.user.id : void 0
        ),
        getLeaveRequestsByMonth(
          input.month,
          ctx.user.role === "employee" ? ctx.user.id : void 0
        ),
        getDashboardSummary(
          input.month,
          ctx.user.role === "employee" ? ctx.user.id : void 0
        )
      ]).then(([attendanceRows, leaveRows, summary]) => ({
        attendance: attendanceRows,
        leave: leaveRows,
        summary
      }))
    ),
    checkIn: staffProcedure.input(
      z2.object({
        employeeId: z2.number().int().positive(),
        checkInMode: z2.enum(["office", "offsite"]),
        latitude: z2.number().finite(),
        longitude: z2.number().finite(),
        deviceId: z2.string().min(16).max(128),
        note: z2.string().max(500).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      await assertEmployeeAccess(
        input.employeeId,
        ctx.user.id,
        ctx.user.role
      );
      if (!isValidCoordinate(input.latitude, input.longitude)) {
        throw new TRPCError2({
          code: "BAD_REQUEST",
          message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1E\u0E34\u0E01\u0E31\u0E14 GPS \u0E17\u0E35\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E01\u0E32\u0E23\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07"
        });
      }
      if (input.checkInMode === "office") {
        const geofence = isWithinOfficeGeofence(
          input.latitude,
          input.longitude
        );
        if (!geofence.allowed) {
          throw new TRPCError2({
            code: "FORBIDDEN",
            message: `\u0E2D\u0E22\u0E39\u0E48\u0E19\u0E2D\u0E01\u0E1E\u0E37\u0E49\u0E19\u0E17\u0E35\u0E48\u0E40\u0E0A\u0E47\u0E04\u0E2D\u0E34\u0E19\u0E2A\u0E33\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19 (\u0E2B\u0E48\u0E32\u0E07\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13 ${Math.round(geofence.distanceMeters)} \u0E40\u0E21\u0E15\u0E23 / \u0E23\u0E31\u0E28\u0E21\u0E35 ${OFFICE_LOCATION.radiusMeters} \u0E40\u0E21\u0E15\u0E23)`
          });
        }
      } else if (!input.note?.trim()) {
        throw new TRPCError2({
          code: "BAD_REQUEST",
          message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E17\u0E33\u0E07\u0E32\u0E19\u0E15\u0E48\u0E32\u0E07\u0E08\u0E31\u0E07\u0E2B\u0E27\u0E31\u0E14"
        });
      }
      if (ctx.user.role === "employee") {
        const employee = await getEmployeeByUserId(ctx.user.id);
        if (!employee)
          throw new TRPCError2({
            code: "FORBIDDEN",
            message: "\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E1C\u0E39\u0E01\u0E01\u0E31\u0E1A\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19"
          });
        if (employee.deviceId && employee.deviceId !== input.deviceId) {
          throw new TRPCError2({
            code: "FORBIDDEN",
            message: "\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E17\u0E35\u0E48\u0E1C\u0E39\u0E01\u0E01\u0E31\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19"
          });
        }
        if (!employee.deviceId)
          await bindEmployeeDevice(employee.id, input.deviceId);
      }
      return checkInEmployee(input.employeeId, getBangkokDate(), Date.now(), {
        checkInMode: input.checkInMode,
        latitude: input.latitude,
        longitude: input.longitude,
        deviceId: input.deviceId,
        recordedByUserId: ctx.user.id,
        note: input.note?.trim() || void 0
      });
    }),
    checkOut: staffProcedure.input(z2.object({ employeeId: z2.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await assertEmployeeAccess(
        input.employeeId,
        ctx.user.id,
        ctx.user.role
      );
      return checkOutEmployee(input.employeeId, getBangkokDate(), Date.now());
    })
  }),
  leave: router({
    list: staffProcedure.query(
      ({ ctx }) => getLeaveRequests(
        8,
        ctx.user.role === "employee" ? ctx.user.id : void 0
      )
    ),
    create: staffProcedure.input(
      z2.object({
        employeeId: z2.number().int().positive(),
        leaveType: z2.enum(["annual", "sick", "personal", "other"]),
        startDate: dateString,
        endDate: dateString,
        totalDays: z2.number().int().positive(),
        reason: z2.string().max(1e3).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      await assertEmployeeAccess(
        input.employeeId,
        ctx.user.id,
        ctx.user.role
      );
      const calculatedDays = countWeekdays(input.startDate, input.endDate);
      if (calculatedDays < 1 || input.totalDays !== calculatedDays) {
        throw new TRPCError2({
          code: "BAD_REQUEST",
          message: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E27\u0E31\u0E19\u0E25\u0E32\u0E2B\u0E23\u0E37\u0E2D\u0E0A\u0E48\u0E27\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07"
        });
      }
      return createLeaveRequest({ ...input, totalDays: calculatedDays });
    }),
    updateStatus: peopleOpsProcedure.input(
      z2.object({
        id: z2.number().int().positive(),
        status: z2.enum(["pending", "approved", "rejected"])
      })
    ).mutation(({ input }) => updateLeaveStatus(input.id, input.status))
  })
});

// server/_core/context.ts
var primaryAdminEmail = (process.env.OWNER_EMAIL ?? "songwit.sont@gmail.com").toLowerCase();
async function createContext(opts) {
  let user = null;
  const authHeader = opts.req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    try {
      const { verifyFirebaseIdToken: verifyFirebaseIdToken2 } = await Promise.resolve().then(() => (init_firebase(), firebase_exports));
      const decoded = await verifyFirebaseIdToken2(authHeader.slice(7));
      const openId = decoded.uid;
      const email = decoded.email ?? null;
      const role = email?.toLowerCase() === primaryAdminEmail ? "admin" : "employee";
      try {
        user = await getUserByOpenId(openId) ?? null;
        if (!user) {
          await upsertUser({
            openId,
            name: decoded.name ?? email ?? openId,
            email,
            loginMethod: "firebase",
            role,
            lastSignedIn: /* @__PURE__ */ new Date()
          });
          user = await getUserByOpenId(openId) ?? null;
        }
      } catch (error) {
        console.warn("[Database] Failed to synchronize Firebase user:", error);
      }
      if (!user) {
        const now = /* @__PURE__ */ new Date();
        user = { id: 0, openId, name: decoded.name ?? email, email, loginMethod: "firebase", role, createdAt: now, updatedAt: now, lastSignedIn: now };
      }
    } catch (error) {
      console.warn("[Firebase Auth] Invalid ID token", error);
    }
  }
  return { req: opts.req, res: opts.res, user };
}

// serverless/trpc.ts
var trpc_default = createExpressMiddleware({
  router: appRouter,
  createContext
});

// serverless/trpc-handler.ts
function handler(req, res) {
  const requestUrl = new URL(req.url ?? "/", "http://vercel.local");
  const requestQuery = req.query ?? {};
  const procedureFromQuery = requestQuery.procedure;
  const procedure = typeof procedureFromQuery === "string" ? procedureFromQuery : requestQuery.procedure instanceof Array ? requestQuery.procedure.join("/") : requestUrl.searchParams.get("procedure") ?? requestUrl.pathname.replace(/^\/api\/trpc\/?/, "");
  if (!procedure) {
    res.status(400).json({ error: "Missing tRPC procedure path" });
    return;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(requestQuery)) {
    if (key === "procedure") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (typeof value === "string") {
      query.set(key, value);
    }
  }
  req.url = `/${procedure}${query.size ? `?${query.toString()}` : ""}`;
  req.path = `/${procedure}`;
  return trpc_default(req, res, () => void 0);
}
export {
  handler as default
};
