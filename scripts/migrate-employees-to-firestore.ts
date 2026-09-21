import mysql from "mysql2/promise";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreDb } from "../server/firebase";

type EmployeeRow = {
  id: number;
  userId: number | null;
  deviceId: string | null;
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  workStartMin: number;
  workEndMin: number;
  status: "active" | "inactive";
  createdAt: number | string;
  updatedAt: number | string;
};

function toMillis(value: number | string): number {
  const millis = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(millis)) throw new Error(`Invalid timestamp: ${String(value)}`);
  return millis;
}

const connection = await mysql.createConnection(process.env.DATABASE_URL!);
let migrated = 0;
let skipped = 0;
try {
  const [rows] = await connection.query<EmployeeRow[]>(
    "SELECT id, userId, deviceId, employeeCode, fullName, department, position, workStartMin, workEndMin, status, createdAt, updatedAt FROM employees ORDER BY id"
  );

  if (rows.length === 0) {
    console.log(JSON.stringify({ source: "TiDB", collection: "employees", sourceCount: 0, migrated: 0, skipped: 0, message: "No employee records found; no Firestore writes performed." }, null, 2));
    process.exit(0);
  }

  const db = getFirestoreDb();
  const batch = db.batch();
  for (const row of rows) {
    const ref = db.collection("employees").doc(row.employeeCode);
    batch.set(ref, {
      legacyId: row.id,
      userId: row.userId,
      deviceId: row.deviceId,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      department: row.department,
      position: row.position,
      workStartMin: row.workStartMin,
      workEndMin: row.workEndMin,
      status: row.status,
      createdAt: Timestamp.fromMillis(toMillis(row.createdAt)),
      updatedAt: Timestamp.fromMillis(toMillis(row.updatedAt)),
      migratedFrom: "tidb",
      migratedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    migrated += 1;
  }
  await batch.commit();
  skipped = rows.length - migrated;
  console.log(JSON.stringify({ source: "TiDB", collection: "employees", sourceCount: rows.length, migrated, skipped, mode: "upsert-by-employeeCode", sourcePreserved: true }, null, 2));
} finally {
  await connection.end();
}
