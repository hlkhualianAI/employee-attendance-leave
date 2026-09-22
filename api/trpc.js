// serverless/trpc.ts
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/routers.ts
import { TRPCError as TRPCError2 } from "@trpc/server";
import { z as z2 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/firebase.ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import { gunzipSync } from "node:zlib";
var firebaseTokenKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Firebase environment variable: ${name}`);
  return value;
}
function getFirebasePrivateKey() {
  const plain = process.env.FIREBASE_PRIVATE_KEY;
  if (plain) {
    const normalized = plain.trim().replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n");
    const begin = "-----BEGIN PRIVATE KEY-----";
    const end = "-----END PRIVATE KEY-----";
    const beginIndex = normalized.indexOf(begin);
    const endIndex = normalized.indexOf(end);
    if (beginIndex >= 0 && endIndex > beginIndex) {
      const body = normalized.slice(beginIndex + begin.length, endIndex).replace(/\s+/g, "");
      return `${begin}
${body.match(/.{1,64}/g)?.join("\n") ?? body}
${end}
`;
    }
    return normalized;
  }
  const compressed = process.env.FIREBASE_PRIVATE_KEY_GZIP_B64;
  if (compressed) return gunzipSync(Buffer.from(compressed, "base64")).toString("utf8");
  const encoded = process.env.FIREBASE_PRIVATE_KEY_B64;
  if (encoded) return Buffer.from(encoded, "base64").toString("utf8");
  throw new Error("Missing required Firebase private key environment variable");
}
async function getFirebaseApp() {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;
  return initializeApp({
    credential: cert({
      projectId: requiredEnv("FIREBASE_PROJECT_ID"),
      clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getFirebasePrivateKey()
    })
  });
}
var firestore;
var firebaseAuth;
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
function getFirebaseProjectId() {
  return requiredEnv("FIREBASE_PROJECT_ID");
}

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
  health: publicProcedure.input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") })).query(() => ({ ok: true })),
  firebaseCheck: adminProcedure.query(async () => {
    const projectId = getFirebaseProjectId();
    const auth = await getFirebaseAuth();
    const authPage = await auth.listUsers(1);
    const firestore3 = await getFirestoreDb();
    const firestorePage = await firestore3.collection("users").limit(1).get();
    return {
      ok: true,
      projectId,
      auth: { ok: true, sampleCount: authPage.users.length },
      firestore: { ok: true, sampleCount: firestorePage.size }
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

// server/attendance.logic.ts
function getBangkokMinutes(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
function getBangkokDate(timestamp = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(timestamp));
}
function calculateLateMinutes(timestamp, workStartMin) {
  return Math.max(0, getBangkokMinutes(timestamp) - workStartMin);
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

// server/local-auth.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
var HASH_ALGORITHM = "sha256";
var SALT_BYTES = 16;
function hashPin(pin) {
  const salt = randomBytes(SALT_BYTES);
  const hash = createHash(HASH_ALGORITHM).update(salt).update(pin).digest("hex");
  return `${salt.toString("hex")}:${hash}`;
}
function verifyPin(pin, encodedHash) {
  if (!encodedHash) return false;
  const [saltHex, expectedHex] = encodedHash.split(":");
  if (!saltHex || !expectedHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(expectedHex)) {
    return false;
  }
  const actual = createHash(HASH_ALGORITHM).update(Buffer.from(saltHex, "hex")).update(pin).digest();
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function sessionSignature(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
function createSessionToken(userId, secret, ttlSeconds = 60 * 60 * 24 * 7) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1e3) + ttlSeconds })).toString("base64url");
  return `${payload}.${sessionSignature(payload, secret)}`;
}
function readSessionUserId(token, secret) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sessionSignature(payload, secret) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.exp > Math.floor(Date.now() / 1e3) && Number.isInteger(parsed.userId) ? parsed.userId : null;
  } catch {
    return null;
  }
}

// server/db.ts
var firestore2 = null;
async function getDb() {
  if (!firestore2) firestore2 = await getFirestoreDb();
  return firestore2;
}
function asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }
  return /* @__PURE__ */ new Date();
}
function asDateString(value, fallbackTimestamp) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = asDate(value);
  const timestamp = Number.isNaN(date.getTime()) ? fallbackTimestamp : date.getTime();
  return bangkokDateFromTimestamp(timestamp);
}
function asNumber(value, fallback = 0) {
  return typeof value === "number" ? value : Number(value ?? fallback);
}
function bangkokDateFromTimestamp(timestamp) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(timestamp)
  );
}
function mapUser(data) {
  return {
    id: asNumber(data.id),
    openId: String(data.openId ?? ""),
    name: data.name ?? null,
    email: data.email ?? null,
    loginMethod: data.loginMethod ?? null,
    role: data.role ?? "employee",
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
    lastSignedIn: asDate(data.lastSignedIn)
  };
}
function mapEmployee(data) {
  return {
    id: asNumber(data.id),
    userId: data.userId == null ? null : asNumber(data.userId),
    deviceId: data.deviceId ?? null,
    employeeCode: String(data.employeeCode ?? ""),
    fullName: String(data.fullName ?? ""),
    department: String(data.department ?? ""),
    position: String(data.position ?? ""),
    startDate: asDateString(data.startDate, asNumber(data.createdAt, Date.now())),
    workStartMin: asNumber(data.workStartMin, 510),
    workEndMin: asNumber(data.workEndMin, 1050),
    status: data.status ?? "active",
    createdAt: asNumber(data.createdAt),
    updatedAt: asNumber(data.updatedAt)
  };
}
function mapAttendance(data) {
  return {
    id: asNumber(data.id),
    employeeId: asNumber(data.employeeId),
    recordedByUserId: data.recordedByUserId == null ? null : asNumber(data.recordedByUserId),
    workDate: String(data.workDate ?? ""),
    checkInAt: data.checkInAt == null ? null : asNumber(data.checkInAt),
    checkOutAt: data.checkOutAt == null ? null : asNumber(data.checkOutAt),
    lateMinutes: asNumber(data.lateMinutes),
    checkInMode: data.checkInMode ?? "office",
    latitude: data.latitude == null ? null : asNumber(data.latitude),
    longitude: data.longitude == null ? null : asNumber(data.longitude),
    deviceId: data.deviceId ?? null,
    note: data.note ?? null,
    createdAt: asNumber(data.createdAt),
    updatedAt: asNumber(data.updatedAt)
  };
}
function mapLeave(data) {
  return {
    id: asNumber(data.id),
    employeeId: asNumber(data.employeeId),
    leaveType: data.leaveType,
    startDate: String(data.startDate ?? ""),
    endDate: String(data.endDate ?? ""),
    totalDays: asNumber(data.totalDays),
    reason: data.reason ?? null,
    status: data.status ?? "pending",
    createdAt: asNumber(data.createdAt),
    updatedAt: asNumber(data.updatedAt)
  };
}
async function records(collection) {
  const snapshot = await (await getDb()).collection(collection).get();
  return snapshot.docs.map((doc) => doc.data());
}
async function allocateId(collection) {
  const db = await getDb();
  const counterRef = db.collection("meta").doc("counters");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const current = snapshot.exists ? asNumber(snapshot.data()?.[collection]) : 0;
    const next = current + 1;
    transaction.set(counterRef, { [collection]: next }, { merge: true });
    return next;
  });
}
async function ensurePrimaryAdmin() {
  const email = (process.env.OWNER_EMAIL ?? "songwit.sont@gmail.com").trim().toLowerCase();
  const existing = await getLocalUserByIdentifier(email);
  if (existing) {
    const snapshot = await (await getDb()).collection("users").where("id", "==", existing.id).limit(1).get();
    if (snapshot.docs[0] && (!existing.pinHash || existing.role !== "admin" || existing.loginMethod !== "local")) {
      await snapshot.docs[0].ref.update({
        pinHash: existing.pinHash ?? hashPin(process.env.OWNER_PIN ?? "123456"),
        loginMethod: "local",
        role: "admin",
        updatedAt: /* @__PURE__ */ new Date()
      });
    }
    if (existing.role !== "admin") {
      if (snapshot.docs[0]) await snapshot.docs[0].ref.update({ role: "admin", updatedAt: /* @__PURE__ */ new Date() });
    }
    return existing;
  }
  const db = await getDb();
  const id = await allocateId("users");
  const now = /* @__PURE__ */ new Date();
  const account = {
    id,
    openId: `local:admin:${email}`,
    name: email,
    email,
    pinHash: hashPin(process.env.OWNER_PIN ?? "123456"),
    loginMethod: "local",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now
  };
  await db.collection("users").doc(String(id)).set(account);
  return account;
}
async function getUsers() {
  await ensurePrimaryAdmin();
  return (await records("users")).map(mapUser).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    lastSignedIn: user.lastSignedIn
  }));
}
async function getUserById(id) {
  const snapshot = await (await getDb()).collection("users").where("id", "==", id).limit(1).get();
  return snapshot.docs[0] ? mapUser(snapshot.docs[0].data()) : void 0;
}
async function getLocalUserByIdentifier(identifier) {
  const normalized = identifier.trim().toLowerCase();
  const snapshot = await (await getDb()).collection("users").get();
  const record = snapshot.docs.map((doc) => doc.data()).find(
    (user) => String(user.email ?? "").toLowerCase() === normalized || String(user.employeeCode ?? "").toLowerCase() === normalized
  );
  return record;
}
async function createLocalEmployeeAccount(input) {
  const db = await getDb();
  const existing = await getLocalUserByIdentifier(input.employeeCode);
  if (existing) throw new Error("\u0E23\u0E2B\u0E31\u0E2A\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E19\u0E35\u0E49\u0E21\u0E35\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E41\u0E25\u0E49\u0E27");
  const id = await allocateId("users");
  const now = /* @__PURE__ */ new Date();
  const account = {
    id,
    openId: `local:${input.employeeCode}`,
    name: input.fullName,
    email: null,
    employeeCode: input.employeeCode,
    pinHash: hashPin(input.pin),
    loginMethod: "local",
    role: input.role ?? "employee",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now
  };
  await db.collection("users").doc(String(id)).set(account);
  return mapUser(account);
}
async function markLocalUserSignedIn(userId) {
  const snapshot = await (await getDb()).collection("users").where("id", "==", userId).limit(1).get();
  if (snapshot.docs[0]) await snapshot.docs[0].ref.update({ lastSignedIn: /* @__PURE__ */ new Date() });
}
async function updateUserRole(id, role) {
  const snapshot = await (await getDb()).collection("users").where("id", "==", id).limit(1).get();
  if (!snapshot.docs[0]) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49");
  await snapshot.docs[0].ref.update({ role, updatedAt: /* @__PURE__ */ new Date() });
  return { id, role };
}
async function getEmployees(userId) {
  return (await records("employees")).map(mapEmployee).filter((employee) => userId === void 0 || employee.userId === userId).sort(
    (a, b) => a.status.localeCompare(b.status) || a.fullName.localeCompare(b.fullName)
  );
}
async function getEmployeeByUserId(userId) {
  const employee = (await getEmployees(userId))[0];
  return employee;
}
async function createEmployee(input) {
  const db = await getDb();
  const duplicate = await db.collection("employees").where("employeeCode", "==", input.employeeCode).limit(1).get();
  if (!duplicate.empty) throw new Error("\u0E23\u0E2B\u0E31\u0E2A\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E41\u0E25\u0E49\u0E27");
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
    updatedAt: now
  };
  const account = await createLocalEmployeeAccount({
    employeeCode: input.employeeCode,
    fullName: input.fullName,
    pin: input.pin ?? process.env.DEFAULT_EMPLOYEE_PIN ?? "123456"
  });
  employee.userId = account.id;
  await db.collection("employees").doc(String(id)).set(employee);
  return mapEmployee(employee);
}
async function updateEmployee(input) {
  const ref = await employeeRef(input.id);
  if (!ref) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19");
  if (input.employeeCode) {
    const duplicate = await (await getDb()).collection("employees").where("employeeCode", "==", input.employeeCode).limit(2).get();
    if (duplicate.docs.some((doc) => doc.ref.path !== ref.path))
      throw new Error("\u0E23\u0E2B\u0E31\u0E2A\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E41\u0E25\u0E49\u0E27");
  }
  const { id: _id, ...changes } = input;
  await ref.update({ ...changes, updatedAt: Date.now() });
  const updated = await ref.get();
  return mapEmployee(updated.data());
}
async function deleteEmployee(id) {
  const ref = await employeeRef(id);
  if (!ref) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19");
  await ref.update({
    status: "inactive",
    userId: null,
    deviceId: null,
    updatedAt: Date.now()
  });
  return { id, status: "inactive" };
}
async function employeeRef(employeeId) {
  const snapshot = await (await getDb()).collection("employees").where("id", "==", employeeId).limit(1).get();
  return snapshot.docs[0]?.ref;
}
async function linkEmployeeUser(employeeId, userId) {
  const ref = await employeeRef(employeeId);
  if (!ref) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19");
  await ref.update({ userId, updatedAt: Date.now() });
  return { employeeId, userId };
}
async function bindEmployeeDevice(employeeId, deviceId) {
  const ref = await employeeRef(employeeId);
  if (!ref) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19");
  await ref.update({ deviceId, updatedAt: Date.now() });
  return { employeeId, deviceId };
}
function joinAttendance(row, employee) {
  return {
    ...row,
    employee,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    department: employee.department
  };
}
async function attendanceWithEmployees() {
  const [attendanceRows, employeeRows] = await Promise.all([
    records("attendance"),
    records("employees")
  ]);
  const employeeMap = new Map(
    employeeRows.map((row) => [asNumber(row.id), mapEmployee(row)])
  );
  return attendanceRows.map(mapAttendance).map((row) => ({ row, employee: employeeMap.get(row.employeeId) })).filter((item) => item.employee).map((item) => joinAttendance(item.row, item.employee));
}
async function getAttendanceByDate(workDate, userId) {
  return (await attendanceWithEmployees()).filter(
    (row) => row.workDate === workDate && (userId === void 0 || row.employee.userId === userId)
  ).sort((a, b) => (b.checkInAt ?? 0) - (a.checkInAt ?? 0)).map(({ employee, ...row }) => row);
}
async function getRecentAttendance(limit = 8, userId) {
  return (await attendanceWithEmployees()).filter((row) => userId === void 0 || row.employee.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map(({ employee, ...row }) => row);
}
async function getAttendanceByMonth(monthPrefix, userId) {
  return (await attendanceWithEmployees()).filter(
    (row) => row.workDate.startsWith(monthPrefix) && (userId === void 0 || row.employee.userId === userId)
  ).sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.fullName.localeCompare(b.fullName)
  ).map((row) => ({
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    department: row.department,
    workDate: row.workDate,
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    lateMinutes: row.lateMinutes,
    checkInMode: row.checkInMode,
    note: row.note
  }));
}
async function getAttendanceByRange(startDate, endDate, userId) {
  return (await attendanceWithEmployees()).filter(
    (row) => row.workDate >= startDate && row.workDate <= endDate && (userId === void 0 || row.employee.userId === userId)
  ).sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.fullName.localeCompare(b.fullName)
  ).map((row) => ({
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    department: row.department,
    workDate: row.workDate,
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    lateMinutes: row.lateMinutes,
    checkInMode: row.checkInMode,
    note: row.note
  }));
}
async function leaveWithEmployees() {
  const [leaveRows, employeeRows] = await Promise.all([
    records("leaveRequests"),
    records("employees")
  ]);
  const employeeMap = new Map(
    employeeRows.map((row) => [asNumber(row.id), mapEmployee(row)])
  );
  return leaveRows.map(mapLeave).map((row) => ({ row, employee: employeeMap.get(row.employeeId) })).filter((item) => item.employee).map((item) => ({
    ...item.row,
    employee: item.employee,
    employeeCode: item.employee.employeeCode,
    fullName: item.employee.fullName,
    department: item.employee.department
  }));
}
async function getLeaveRequests(limit = 8, userId) {
  return (await leaveWithEmployees()).filter((row) => userId === void 0 || row.employee.userId === userId).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(({ employee, ...row }) => row);
}
async function getLeaveRequestsByMonth(monthPrefix, userId) {
  return (await leaveWithEmployees()).filter(
    (row) => row.startDate.startsWith(monthPrefix) && (userId === void 0 || row.employee.userId === userId)
  ).sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.fullName.localeCompare(b.fullName)
  ).map((row) => ({
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    department: row.department,
    leaveType: row.leaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    totalDays: row.totalDays,
    reason: row.reason,
    status: row.status
  }));
}
async function getLeaveRequestsByRange(startDate, endDate, userId) {
  return (await leaveWithEmployees()).filter(
    (row) => row.startDate <= endDate && row.endDate >= startDate && (userId === void 0 || row.employee.userId === userId)
  ).sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.fullName.localeCompare(b.fullName)
  ).map((row) => ({
    id: row.id,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    department: row.department,
    leaveType: row.leaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    totalDays: row.totalDays,
    reason: row.reason,
    status: row.status
  }));
}
async function getDashboardSummary(monthPrefix, userId) {
  const [employees, attendanceRows, leaveRows] = await Promise.all([
    getEmployees(userId),
    attendanceWithEmployees(),
    leaveWithEmployees()
  ]);
  const scopedAttendance = attendanceRows.filter(
    (row) => row.workDate.startsWith(monthPrefix) && (userId === void 0 || row.employee.userId === userId)
  );
  const scopedLeave = leaveRows.filter(
    (row) => userId === void 0 || row.employee.userId === userId
  );
  return {
    totalEmployees: employees.filter((employee) => employee.status === "active").length,
    presentDays: scopedAttendance.length,
    lateDays: scopedAttendance.filter((row) => row.lateMinutes > 0).length,
    approvedLeaveDays: scopedLeave.filter(
      (row) => row.startDate.startsWith(monthPrefix) && row.status === "approved"
    ).reduce((sum, row) => sum + row.totalDays, 0),
    pendingLeaves: scopedLeave.filter((row) => row.status === "pending").length
  };
}
async function getDashboardSummaryByRange(startDate, endDate, userId) {
  const [employees, attendanceRows, leaveRows] = await Promise.all([
    getEmployees(userId),
    attendanceWithEmployees(),
    leaveWithEmployees()
  ]);
  const scopedAttendance = attendanceRows.filter(
    (row) => row.workDate >= startDate && row.workDate <= endDate && (userId === void 0 || row.employee.userId === userId)
  );
  const scopedLeave = leaveRows.filter(
    (row) => row.startDate <= endDate && row.endDate >= startDate && (userId === void 0 || row.employee.userId === userId)
  );
  return {
    totalEmployees: employees.filter((employee) => employee.status === "active").length,
    presentDays: scopedAttendance.length,
    lateDays: scopedAttendance.filter((row) => row.lateMinutes > 0).length,
    approvedLeaveDays: scopedLeave.filter((row) => row.status === "approved").reduce(
      (sum, row) => sum + countWeekdays(
        row.startDate < startDate ? startDate : row.startDate,
        row.endDate > endDate ? endDate : row.endDate
      ),
      0
    ),
    pendingLeaves: scopedLeave.filter((row) => row.status === "pending").length
  };
}
async function attendanceRef(employeeId, workDate) {
  const snapshot = await (await getDb()).collection("attendance").where("employeeId", "==", employeeId).where("workDate", "==", workDate).limit(1).get();
  return snapshot.docs[0]?.ref;
}
async function checkInEmployee(employeeId, workDate, timestamp, input) {
  const db = await getDb();
  const employee = (await getEmployees()).find((item) => item.id === employeeId);
  if (!employee) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19");
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
    updatedAt: now
  };
  if (existingRef) {
    await existingRef.update(values);
    return { id: employeeId, lateMinutes };
  }
  const id = await allocateId("attendance");
  await db.collection("attendance").doc(String(id)).set({ id, ...values, checkOutAt: null, createdAt: now });
  return { id, lateMinutes };
}
async function checkOutEmployee(employeeId, workDate, timestamp) {
  const ref = await attendanceRef(employeeId, workDate);
  if (!ref) throw new Error("\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E47\u0E04\u0E2D\u0E34\u0E19\u0E02\u0E2D\u0E07\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49");
  await ref.update({ checkOutAt: timestamp, updatedAt: Date.now() });
  return { id: employeeId };
}
async function createLeaveRequest(input) {
  const db = await getDb();
  const id = await allocateId("leaveRequests");
  const now = Date.now();
  const values = {
    id,
    ...input,
    reason: input.reason ?? null,
    status: "pending",
    createdAt: now,
    updatedAt: now
  };
  await db.collection("leaveRequests").doc(String(id)).set(values);
  return values;
}
async function updateLeaveStatus(id, status) {
  const snapshot = await (await getDb()).collection("leaveRequests").where("id", "==", id).limit(1).get();
  if (!snapshot.docs[0]) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E25\u0E32");
  await snapshot.docs[0].ref.update({ status, updatedAt: Date.now() });
  return { id, status };
}

// server/_core/context.ts
import { parse } from "cookie";
var SESSION_COOKIE = "timekeep_session";
function getLocalAuthSecret() {
  return process.env.LOCAL_AUTH_SECRET ?? `${process.env.OWNER_EMAIL ?? "songwit.sont@gmail.com"}:timekeep`;
}
async function createContext(opts) {
  const token = parse(opts.req.headers.cookie ?? "")[SESSION_COOKIE];
  const userId = readSessionUserId(token, getLocalAuthSecret());
  const user = userId === null ? null : await getUserById(userId) ?? null;
  return { req: opts.req, res: opts.res, user };
}

// server/routers.ts
import { serialize } from "cookie";
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
    login: publicProcedure.input(z2.object({ identifier: z2.string().min(1).max(160), pin: z2.string().min(4).max(128) })).mutation(async ({ input, ctx }) => {
      await ensurePrimaryAdmin();
      const account = await getLocalUserByIdentifier(input.identifier);
      if (!account || !verifyPin(input.pin, String(account.pinHash ?? ""))) {
        throw new TRPCError2({ code: "UNAUTHORIZED", message: "\u0E23\u0E2B\u0E31\u0E2A\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E2B\u0E23\u0E37\u0E2D PIN \u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" });
      }
      await markLocalUserSignedIn(account.id);
      ctx.res.setHeader("Set-Cookie", serialize(SESSION_COOKIE, createSessionToken(account.id, getLocalAuthSecret()), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7
      }));
      return { success: true };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      if (typeof ctx.res.setHeader === "function") {
        ctx.res.setHeader("Set-Cookie", serialize(SESSION_COOKIE, "", {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 0
        }));
      }
      return { success: true };
    })
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
        startDate: dateString,
        workStartMin: z2.number().int().min(0).max(1439).optional(),
        workEndMin: z2.number().int().min(0).max(1439).optional(),
        userId: z2.number().int().positive().optional(),
        pin: z2.string().min(4).max(128)
      })
    ).mutation(({ input }) => createEmployee(input)),
    update: peopleOpsProcedure.input(
      z2.object({
        id: z2.number().int().positive(),
        employeeCode: z2.string().min(1).max(32),
        fullName: z2.string().min(1).max(160),
        department: z2.string().min(1).max(120),
        position: z2.string().min(1).max(120),
        startDate: dateString,
        workStartMin: z2.number().int().min(0).max(1439).optional(),
        workEndMin: z2.number().int().min(0).max(1439).optional()
      })
    ).mutation(({ input }) => updateEmployee(input)),
    delete: peopleOpsProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(({ input }) => deleteEmployee(input.id)),
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
    reportRange: staffProcedure.input(z2.object({ startDate: dateString, endDate: dateString })).query(({ input, ctx }) => {
      if (input.startDate > input.endDate)
        throw new TRPCError2({
          code: "BAD_REQUEST",
          message: "\u0E0A\u0E48\u0E27\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07"
        });
      const userId = ctx.user.role === "employee" ? ctx.user.id : void 0;
      return Promise.all([
        getAttendanceByRange(input.startDate, input.endDate, userId),
        getLeaveRequestsByRange(input.startDate, input.endDate, userId),
        getDashboardSummaryByRange(input.startDate, input.endDate, userId)
      ]).then(([attendance, leave, summary]) => ({
        attendance,
        leave,
        summary
      }));
    }),
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
