// serverless/trpc.ts
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
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
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
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
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
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
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
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
      throw new TRPCError3({ code: "FORBIDDEN", message: "\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49" });
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
    throw new TRPCError3({ code: "FORBIDDEN", message: "\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E2D\u0E07\u0E15\u0E19\u0E40\u0E2D\u0E07" });
  }
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  users: router({
    list: adminProcedure2.query(() => getUsers()),
    updateRole: adminProcedure2.input(z2.object({ id: z2.number().int().positive(), role: roleSchema })).mutation(({ input, ctx }) => {
      if (input.id === ctx.user.id && input.role !== "admin") {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E25\u0E14\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E02\u0E2D\u0E07\u0E15\u0E31\u0E27\u0E40\u0E2D\u0E07\u0E44\u0E14\u0E49" });
      }
      return updateUserRole(input.id, input.role);
    })
  }),
  employees: router({
    list: staffProcedure.query(({ ctx }) => ctx.user.role === "employee" ? getEmployees(ctx.user.id) : getEmployees()),
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
    linkUser: peopleOpsProcedure.input(z2.object({ employeeId: z2.number().int().positive(), userId: z2.number().int().positive().nullable() })).mutation(async ({ input }) => {
      if (input.userId !== null) {
        const account = await getUserById(input.userId);
        const accountRole = effectiveRole(account?.role ?? "employee");
        if (accountRole !== "employee") {
          throw new TRPCError3({ code: "BAD_REQUEST", message: "\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B" });
        }
      }
      return linkEmployeeUser(input.employeeId, input.userId);
    }),
    resetDevice: peopleOpsProcedure.input(z2.object({ employeeId: z2.number().int().positive() })).mutation(({ input }) => bindEmployeeDevice(input.employeeId, null))
  }),
  attendance: router({
    summary: staffProcedure.input(z2.object({ month: z2.string().regex(/^\d{4}-\d{2}$/) })).query(({ input, ctx }) => getDashboardSummary(input.month, ctx.user.role === "employee" ? ctx.user.id : void 0)),
    recent: staffProcedure.query(({ ctx }) => getRecentAttendance(8, ctx.user.role === "employee" ? ctx.user.id : void 0)),
    byDate: staffProcedure.input(z2.object({ workDate: dateString })).query(({ input, ctx }) => getAttendanceByDate(input.workDate, ctx.user.role === "employee" ? ctx.user.id : void 0)),
    checkIn: staffProcedure.input(z2.object({ employeeId: z2.number().int().positive(), checkInMode: z2.enum(["office", "offsite"]), latitude: z2.number().finite(), longitude: z2.number().finite(), deviceId: z2.string().min(16).max(128), note: z2.string().max(500).optional() })).mutation(async ({ input, ctx }) => {
      await assertEmployeeAccess(input.employeeId, ctx.user.id, ctx.user.role);
      if (!isValidCoordinate(input.latitude, input.longitude)) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1E\u0E34\u0E01\u0E31\u0E14 GPS \u0E17\u0E35\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E01\u0E32\u0E23\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07" });
      }
      if (input.checkInMode === "office") {
        const geofence = isWithinOfficeGeofence(input.latitude, input.longitude);
        if (!geofence.allowed) {
          throw new TRPCError3({ code: "FORBIDDEN", message: `\u0E2D\u0E22\u0E39\u0E48\u0E19\u0E2D\u0E01\u0E1E\u0E37\u0E49\u0E19\u0E17\u0E35\u0E48\u0E40\u0E0A\u0E47\u0E04\u0E2D\u0E34\u0E19\u0E2A\u0E33\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19 (\u0E2B\u0E48\u0E32\u0E07\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13 ${Math.round(geofence.distanceMeters)} \u0E40\u0E21\u0E15\u0E23 / \u0E23\u0E31\u0E28\u0E21\u0E35 ${OFFICE_LOCATION.radiusMeters} \u0E40\u0E21\u0E15\u0E23)` });
        }
      } else if (!input.note?.trim()) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E17\u0E33\u0E07\u0E32\u0E19\u0E15\u0E48\u0E32\u0E07\u0E08\u0E31\u0E07\u0E2B\u0E27\u0E31\u0E14" });
      }
      if (ctx.user.role === "employee") {
        const employee = await getEmployeeByUserId(ctx.user.id);
        if (!employee) throw new TRPCError3({ code: "FORBIDDEN", message: "\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E1C\u0E39\u0E01\u0E01\u0E31\u0E1A\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19" });
        if (employee.deviceId && employee.deviceId !== input.deviceId) {
          throw new TRPCError3({ code: "FORBIDDEN", message: "\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E17\u0E35\u0E48\u0E1C\u0E39\u0E01\u0E01\u0E31\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19" });
        }
        if (!employee.deviceId) await bindEmployeeDevice(employee.id, input.deviceId);
      }
      return checkInEmployee(input.employeeId, getBangkokDate(), Date.now(), { checkInMode: input.checkInMode, latitude: input.latitude, longitude: input.longitude, deviceId: input.deviceId, recordedByUserId: ctx.user.id, note: input.note?.trim() || void 0 });
    }),
    checkOut: staffProcedure.input(z2.object({ employeeId: z2.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await assertEmployeeAccess(input.employeeId, ctx.user.id, ctx.user.role);
      return checkOutEmployee(input.employeeId, getBangkokDate(), Date.now());
    })
  }),
  leave: router({
    list: staffProcedure.query(({ ctx }) => getLeaveRequests(8, ctx.user.role === "employee" ? ctx.user.id : void 0)),
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
      await assertEmployeeAccess(input.employeeId, ctx.user.id, ctx.user.role);
      return createLeaveRequest(input);
    }),
    updateStatus: peopleOpsProcedure.input(z2.object({ id: z2.number().int().positive(), status: z2.enum(["pending", "approved", "rejected"]) })).mutation(({ input }) => updateLeaveStatus(input.id, input.status))
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
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
  return trpc_default(req, res, () => void 0);
}
export {
  handler as default
};
