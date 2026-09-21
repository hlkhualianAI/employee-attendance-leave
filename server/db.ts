import type { Firestore } from "firebase-admin/firestore";
import { calculateLateMinutes, countWeekdays } from "./attendance.logic";
import { getFirebaseAuth, getFirestoreDb } from "./firebase";
import type {
  Attendance,
  Employee,
  InsertUser,
  LeaveRequest,
  User,
} from "../drizzle/schema";

type AppRole = "admin" | "hr" | "employee";
type FirestoreRecord = Record<string, unknown>;

let firestore: Firestore | null = null;

export async function getDb() {
  if (!firestore) firestore = await getFirestoreDb();
  return firestore;
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string")
    return new Date(value);
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }
  return new Date();
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : Number(value ?? fallback);
}

function bangkokDateFromTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(timestamp)
  );
}

function mapUser(data: FirestoreRecord): User {
  return {
    id: asNumber(data.id),
    openId: String(data.openId ?? ""),
    name: (data.name as string | null | undefined) ?? null,
    email: (data.email as string | null | undefined) ?? null,
    loginMethod: (data.loginMethod as string | null | undefined) ?? null,
    role: (data.role as User["role"]) ?? "employee",
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
    lastSignedIn: asDate(data.lastSignedIn),
  };
}

function mapEmployee(data: FirestoreRecord): Employee {
  return {
    id: asNumber(data.id),
    userId: data.userId == null ? null : asNumber(data.userId),
    deviceId: (data.deviceId as string | null | undefined) ?? null,
    employeeCode: String(data.employeeCode ?? ""),
    fullName: String(data.fullName ?? ""),
    department: String(data.department ?? ""),
    position: String(data.position ?? ""),
    startDate: String(
      data.startDate ?? bangkokDateFromTimestamp(asNumber(data.createdAt))
    ),
    workStartMin: asNumber(data.workStartMin, 510),
    workEndMin: asNumber(data.workEndMin, 1050),
    status: (data.status as Employee["status"]) ?? "active",
    createdAt: asNumber(data.createdAt),
    updatedAt: asNumber(data.updatedAt),
  };
}

function mapAttendance(data: FirestoreRecord): Attendance {
  return {
    id: asNumber(data.id),
    employeeId: asNumber(data.employeeId),
    recordedByUserId:
      data.recordedByUserId == null ? null : asNumber(data.recordedByUserId),
    workDate: String(data.workDate ?? ""),
    checkInAt: data.checkInAt == null ? null : asNumber(data.checkInAt),
    checkOutAt: data.checkOutAt == null ? null : asNumber(data.checkOutAt),
    lateMinutes: asNumber(data.lateMinutes),
    checkInMode: (data.checkInMode as Attendance["checkInMode"]) ?? "office",
    latitude: data.latitude == null ? null : asNumber(data.latitude),
    longitude: data.longitude == null ? null : asNumber(data.longitude),
    deviceId: (data.deviceId as string | null | undefined) ?? null,
    note: (data.note as string | null | undefined) ?? null,
    createdAt: asNumber(data.createdAt),
    updatedAt: asNumber(data.updatedAt),
  };
}

function mapLeave(data: FirestoreRecord): LeaveRequest {
  return {
    id: asNumber(data.id),
    employeeId: asNumber(data.employeeId),
    leaveType: data.leaveType as LeaveRequest["leaveType"],
    startDate: String(data.startDate ?? ""),
    endDate: String(data.endDate ?? ""),
    totalDays: asNumber(data.totalDays),
    reason: (data.reason as string | null | undefined) ?? null,
    status: (data.status as LeaveRequest["status"]) ?? "pending",
    createdAt: asNumber(data.createdAt),
    updatedAt: asNumber(data.updatedAt),
  };
}

async function records(collection: string): Promise<FirestoreRecord[]> {
  const snapshot = await (await getDb()).collection(collection).get();
  return snapshot.docs.map(doc => doc.data() as FirestoreRecord);
}

async function allocateId(collection: string): Promise<number> {
  const db = await getDb();
  const counterRef = db.collection("meta").doc("counters");
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(counterRef);
    const current = snapshot.exists
      ? asNumber(snapshot.data()?.[collection])
      : 0;
    const next = current + 1;
    transaction.set(counterRef, { [collection]: next }, { merge: true });
    return next;
  });
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  const snapshot = await db
    .collection("users")
    .where("openId", "==", user.openId)
    .limit(1)
    .get();
  const now = new Date();
  const existing = snapshot.docs[0];
  const id = existing
    ? asNumber(existing.data().id)
    : await allocateId("users");
  const values = {
    id,
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? "firebase",
    role: user.role ?? "employee",
    createdAt: existing ? existing.data().createdAt : now,
    updatedAt: now,
    lastSignedIn: user.lastSignedIn ?? now,
  };
  await db
    .collection("users")
    .doc(existing?.id ?? String(id))
    .set(values, { merge: true });
}

export async function getUserByOpenId(openId: string) {
  const snapshot = await (await getDb())
    .collection("users")
    .where("openId", "==", openId)
    .limit(1)
    .get();
  return snapshot.docs[0] ? mapUser(snapshot.docs[0].data()) : undefined;
}

export async function getUsers() {
  const auth = await getFirebaseAuth();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    const knownUsers = await records("users");
    const knownOpenIds = new Set(knownUsers.map(user => String(user.openId ?? "")));
    for (const authUser of page.users) {
      if (!knownOpenIds.has(authUser.uid)) {
        await upsertUser({
          openId: authUser.uid,
          name: authUser.displayName ?? authUser.email ?? null,
          email: authUser.email ?? null,
          loginMethod: authUser.providerData[0]?.providerId ?? "firebase",
          role: "employee",
          lastSignedIn: authUser.metadata.lastSignInTime
            ? new Date(authUser.metadata.lastSignInTime)
            : new Date(),
        });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return (await records("users"))
    .map(mapUser)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      lastSignedIn: user.lastSignedIn,
    }));
}

export async function getUserById(id: number) {
  const snapshot = await (await getDb())
    .collection("users")
    .where("id", "==", id)
    .limit(1)
    .get();
  return snapshot.docs[0] ? mapUser(snapshot.docs[0].data()) : undefined;
}

export async function updateUserRole(id: number, role: AppRole) {
  const snapshot = await (await getDb())
    .collection("users")
    .where("id", "==", id)
    .limit(1)
    .get();
  if (!snapshot.docs[0]) throw new Error("ไม่พบข้อมูลผู้ใช้");
  await snapshot.docs[0].ref.update({ role, updatedAt: new Date() });
  return { id, role };
}

export async function getEmployees(userId?: number) {
  return (await records("employees"))
    .map(mapEmployee)
    .filter(employee => userId === undefined || employee.userId === userId)
    .sort(
      (a, b) =>
        a.status.localeCompare(b.status) || a.fullName.localeCompare(b.fullName)
    );
}

export async function getEmployeeByUserId(userId: number) {
  const employee = (await getEmployees(userId))[0];
  return employee;
}

export async function createEmployee(input: {
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  startDate: string;
  workStartMin?: number;
  workEndMin?: number;
  userId?: number;
}) {
  const db = await getDb();
  const duplicate = await db
    .collection("employees")
    .where("employeeCode", "==", input.employeeCode)
    .limit(1)
    .get();
  if (!duplicate.empty) throw new Error("รหัสพนักงานนี้ถูกใช้งานแล้ว");
  const id = await allocateId("employees");
  const now = Date.now();
  const employee = {
    id,
    userId: input.userId ?? null,
    deviceId: null,
    employeeCode: input.employeeCode,
    fullName: input.fullName,
    department: input.department,
    position: input.position,
    startDate: input.startDate,
    workStartMin: input.workStartMin ?? 510,
    workEndMin: input.workEndMin ?? 1050,
    status: "active",
    createdAt: now,
    updatedAt: now,
  } satisfies FirestoreRecord;
  await db.collection("employees").doc(String(id)).set(employee);
  return mapEmployee(employee);
}

export async function updateEmployee(input: {
  id: number;
  employeeCode?: string;
  fullName?: string;
  department?: string;
  position?: string;
  startDate?: string;
  workStartMin?: number;
  workEndMin?: number;
}) {
  const ref = await employeeRef(input.id);
  if (!ref) throw new Error("ไม่พบข้อมูลพนักงาน");
  if (input.employeeCode) {
    const duplicate = await (await getDb())
      .collection("employees")
      .where("employeeCode", "==", input.employeeCode)
      .limit(2)
      .get();
    if (duplicate.docs.some(doc => doc.ref.path !== ref.path))
      throw new Error("รหัสพนักงานนี้ถูกใช้งานแล้ว");
  }
  const { id: _id, ...changes } = input;
  await ref.update({ ...changes, updatedAt: Date.now() });
  const updated = await ref.get();
  return mapEmployee(updated.data() as FirestoreRecord);
}

export async function deleteEmployee(id: number) {
  const ref = await employeeRef(id);
  if (!ref) throw new Error("ไม่พบข้อมูลพนักงาน");
  await ref.update({
    status: "inactive",
    userId: null,
    deviceId: null,
    updatedAt: Date.now(),
  });
  return { id, status: "inactive" as const };
}

async function employeeRef(employeeId: number) {
  const snapshot = await (await getDb())
    .collection("employees")
    .where("id", "==", employeeId)
    .limit(1)
    .get();
  return snapshot.docs[0]?.ref;
}

export async function linkEmployeeUser(
  employeeId: number,
  userId: number | null
) {
  const ref = await employeeRef(employeeId);
  if (!ref) throw new Error("ไม่พบข้อมูลพนักงาน");
  await ref.update({ userId, updatedAt: Date.now() });
  return { employeeId, userId };
}

export async function bindEmployeeDevice(
  employeeId: number,
  deviceId: string | null
) {
  const ref = await employeeRef(employeeId);
  if (!ref) throw new Error("ไม่พบข้อมูลพนักงาน");
  await ref.update({ deviceId, updatedAt: Date.now() });
  return { employeeId, deviceId };
}

function joinAttendance(row: Attendance, employee: Employee) {
  return {
    ...row,
    employee,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    department: employee.department,
  };
}

async function attendanceWithEmployees() {
  const [attendanceRows, employeeRows] = await Promise.all([
    records("attendance"),
    records("employees"),
  ]);
  const employeeMap = new Map(
    employeeRows.map(row => [asNumber(row.id), mapEmployee(row)])
  );
  return attendanceRows
    .map(mapAttendance)
    .map(row => ({ row, employee: employeeMap.get(row.employeeId) }))
    .filter(item => item.employee)
    .map(item => joinAttendance(item.row, item.employee!));
}

export async function getAttendanceByDate(workDate: string, userId?: number) {
  return (await attendanceWithEmployees())
    .filter(
      row =>
        row.workDate === workDate &&
        (userId === undefined || row.employee.userId === userId)
    )
    .sort((a, b) => (b.checkInAt ?? 0) - (a.checkInAt ?? 0))
    .map(({ employee, ...row }) => row);
}

export async function getRecentAttendance(limit = 8, userId?: number) {
  return (await attendanceWithEmployees())
    .filter(row => userId === undefined || row.employee.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map(({ employee, ...row }) => row);
}

export async function getAttendanceByMonth(
  monthPrefix: string,
  userId?: number
) {
  return (await attendanceWithEmployees())
    .filter(
      row =>
        row.workDate.startsWith(monthPrefix) &&
        (userId === undefined || row.employee.userId === userId)
    )
    .sort(
      (a, b) =>
        a.workDate.localeCompare(b.workDate) ||
        a.fullName.localeCompare(b.fullName)
    )
    .map(row => ({
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      department: row.department,
      workDate: row.workDate,
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      lateMinutes: row.lateMinutes,
      checkInMode: row.checkInMode,
      note: row.note,
    }));
}

export async function getAttendanceByRange(
  startDate: string,
  endDate: string,
  userId?: number
) {
  return (await attendanceWithEmployees())
    .filter(
      row =>
        row.workDate >= startDate &&
        row.workDate <= endDate &&
        (userId === undefined || row.employee.userId === userId)
    )
    .sort(
      (a, b) =>
        a.workDate.localeCompare(b.workDate) ||
        a.fullName.localeCompare(b.fullName)
    )
    .map(row => ({
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      department: row.department,
      workDate: row.workDate,
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      lateMinutes: row.lateMinutes,
      checkInMode: row.checkInMode,
      note: row.note,
    }));
}

async function leaveWithEmployees() {
  const [leaveRows, employeeRows] = await Promise.all([
    records("leaveRequests"),
    records("employees"),
  ]);
  const employeeMap = new Map(
    employeeRows.map(row => [asNumber(row.id), mapEmployee(row)])
  );
  return leaveRows
    .map(mapLeave)
    .map(row => ({ row, employee: employeeMap.get(row.employeeId) }))
    .filter(item => item.employee)
    .map(item => ({
      ...item.row,
      employee: item.employee!,
      employeeCode: item.employee!.employeeCode,
      fullName: item.employee!.fullName,
      department: item.employee!.department,
    }));
}

export async function getLeaveRequests(limit = 8, userId?: number) {
  return (await leaveWithEmployees())
    .filter(row => userId === undefined || row.employee.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(({ employee, ...row }) => row);
}

export async function getLeaveRequestsByMonth(
  monthPrefix: string,
  userId?: number
) {
  return (await leaveWithEmployees())
    .filter(
      row =>
        row.startDate.startsWith(monthPrefix) &&
        (userId === undefined || row.employee.userId === userId)
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.fullName.localeCompare(b.fullName)
    )
    .map(row => ({
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      department: row.department,
      leaveType: row.leaveType,
      startDate: row.startDate,
      endDate: row.endDate,
      totalDays: row.totalDays,
      reason: row.reason,
      status: row.status,
    }));
}

export async function getLeaveRequestsByRange(
  startDate: string,
  endDate: string,
  userId?: number
) {
  return (await leaveWithEmployees())
    .filter(
      row =>
        row.startDate <= endDate &&
        row.endDate >= startDate &&
        (userId === undefined || row.employee.userId === userId)
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.fullName.localeCompare(b.fullName)
    )
    .map(row => ({
      id: row.id,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      department: row.department,
      leaveType: row.leaveType,
      startDate: row.startDate,
      endDate: row.endDate,
      totalDays: row.totalDays,
      reason: row.reason,
      status: row.status,
    }));
}

export async function getDashboardSummary(
  monthPrefix: string,
  userId?: number
) {
  const [employees, attendanceRows, leaveRows] = await Promise.all([
    getEmployees(userId),
    attendanceWithEmployees(),
    leaveWithEmployees(),
  ]);
  const scopedAttendance = attendanceRows.filter(
    row =>
      row.workDate.startsWith(monthPrefix) &&
      (userId === undefined || row.employee.userId === userId)
  );
  const scopedLeave = leaveRows.filter(
    row => userId === undefined || row.employee.userId === userId
  );
  return {
    totalEmployees: employees.filter(employee => employee.status === "active")
      .length,
    presentDays: scopedAttendance.length,
    lateDays: scopedAttendance.filter(row => row.lateMinutes > 0).length,
    approvedLeaveDays: scopedLeave
      .filter(
        row =>
          row.startDate.startsWith(monthPrefix) && row.status === "approved"
      )
      .reduce((sum, row) => sum + row.totalDays, 0),
    pendingLeaves: scopedLeave.filter(row => row.status === "pending").length,
  };
}

export async function getDashboardSummaryByRange(
  startDate: string,
  endDate: string,
  userId?: number
) {
  const [employees, attendanceRows, leaveRows] = await Promise.all([
    getEmployees(userId),
    attendanceWithEmployees(),
    leaveWithEmployees(),
  ]);
  const scopedAttendance = attendanceRows.filter(
    row =>
      row.workDate >= startDate &&
      row.workDate <= endDate &&
      (userId === undefined || row.employee.userId === userId)
  );
  const scopedLeave = leaveRows.filter(
    row =>
      row.startDate <= endDate &&
      row.endDate >= startDate &&
      (userId === undefined || row.employee.userId === userId)
  );
  return {
    totalEmployees: employees.filter(employee => employee.status === "active")
      .length,
    presentDays: scopedAttendance.length,
    lateDays: scopedAttendance.filter(row => row.lateMinutes > 0).length,
    approvedLeaveDays: scopedLeave
      .filter(row => row.status === "approved")
      .reduce(
        (sum, row) =>
          sum +
          countWeekdays(
            row.startDate < startDate ? startDate : row.startDate,
            row.endDate > endDate ? endDate : row.endDate
          ),
        0
      ),
    pendingLeaves: scopedLeave.filter(row => row.status === "pending").length,
  };
}

async function attendanceRef(employeeId: number, workDate: string) {
  const snapshot = await (await getDb())
    .collection("attendance")
    .where("employeeId", "==", employeeId)
    .where("workDate", "==", workDate)
    .limit(1)
    .get();
  return snapshot.docs[0]?.ref;
}

export async function checkInEmployee(
  employeeId: number,
  workDate: string,
  timestamp: number,
  input: {
    checkInMode: "office" | "offsite";
    latitude: number;
    longitude: number;
    deviceId: string;
    recordedByUserId: number;
    note?: string;
  }
) {
  const db = await getDb();
  const employee = (await getEmployees()).find(item => item.id === employeeId);
  if (!employee) throw new Error("ไม่พบข้อมูลพนักงาน");
  const lateMinutes = calculateLateMinutes(timestamp, employee.workStartMin);
  const now = Date.now();
  const existingRef = await attendanceRef(employeeId, workDate);
  const values = {
    employeeId,
    workDate,
    checkInAt: timestamp,
    lateMinutes,
    ...input,
    note: input.note ?? null,
    updatedAt: now,
  };
  if (existingRef) {
    await existingRef.update(values);
    return { id: employeeId, lateMinutes };
  }
  const id = await allocateId("attendance");
  await db
    .collection("attendance")
    .doc(String(id))
    .set({ id, ...values, checkOutAt: null, createdAt: now });
  return { id, lateMinutes };
}

export async function checkOutEmployee(
  employeeId: number,
  workDate: string,
  timestamp: number
) {
  const ref = await attendanceRef(employeeId, workDate);
  if (!ref) throw new Error("ยังไม่มีรายการเช็คอินของวันนี้");
  await ref.update({ checkOutAt: timestamp, updatedAt: Date.now() });
  return { id: employeeId };
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
  const id = await allocateId("leaveRequests");
  const now = Date.now();
  const values = {
    id,
    ...input,
    reason: input.reason ?? null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("leaveRequests").doc(String(id)).set(values);
  return values;
}

export async function updateLeaveStatus(
  id: number,
  status: "pending" | "approved" | "rejected"
) {
  const snapshot = await (await getDb())
    .collection("leaveRequests")
    .where("id", "==", id)
    .limit(1)
    .get();
  if (!snapshot.docs[0]) throw new Error("ไม่พบคำขอลา");
  await snapshot.docs[0].ref.update({ status, updatedAt: Date.now() });
  return { id, status };
}

export async function seedDemoData() {
  const existing = await getEmployees();
  if (existing.length > 0) return { employees: existing.length, seeded: false };
  const demoEmployees = [
    {
      employeeCode: "EMP-001",
      fullName: "สมชาย ใจดี",
      department: "ฝ่ายขาย",
      position: "Sales Executive",
      startDate: "2024-01-08",
    },
    {
      employeeCode: "EMP-002",
      fullName: "สมหญิง พรประเสริฐ",
      department: "ฝ่ายบุคคล",
      position: "HR Officer",
      startDate: "2024-02-01",
    },
    {
      employeeCode: "EMP-003",
      fullName: "ธนกร ศรีสุข",
      department: "ฝ่ายบัญชี",
      position: "Accountant",
      startDate: "2024-03-04",
    },
  ];
  for (const employee of demoEmployees) await createEmployee(employee);
  return { employees: demoEmployees.length, seeded: true };
}
