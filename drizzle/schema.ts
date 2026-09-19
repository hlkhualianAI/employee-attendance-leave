import { bigint, double, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "hr", "employee"]).default("employee").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const employees = mysqlTable(
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
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  (table) => ({
    userIdx: index("employees_user_idx").on(table.userId),
    departmentIdx: index("employees_department_idx").on(table.department),
    statusIdx: index("employees_status_idx").on(table.status),
  }),
);

export const attendance = mysqlTable(
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
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  (table) => ({
    employeeDateIdx: index("attendance_employee_date_idx").on(table.employeeId, table.workDate),
    dateIdx: index("attendance_date_idx").on(table.workDate),
  }),
);

export const leaveRequests = mysqlTable(
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
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  (table) => ({
    employeeIdx: index("leave_employee_idx").on(table.employeeId),
    statusIdx: index("leave_status_idx").on(table.status),
    dateIdx: index("leave_date_idx").on(table.startDate, table.endDate),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
