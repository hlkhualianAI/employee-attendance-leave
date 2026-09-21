import mysql from "mysql2/promise";

const connection = await mysql.createConnection(process.env.DATABASE_URL!);
try {
  const [countRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'inactive') AS inactive FROM employees"
  );
  const [samples] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT id, userId, employeeCode, fullName, department, position, workStartMin, workEndMin, status, createdAt, updatedAt, deviceId FROM employees ORDER BY id LIMIT 5"
  );
  const [duplicateCodes] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT employeeCode, COUNT(*) AS total FROM employees GROUP BY employeeCode HAVING COUNT(*) > 1 LIMIT 10"
  );
  console.log(JSON.stringify({
    counts: countRows[0] ?? null,
    sampleShape: samples.map((row) => ({
      id: row.id,
      userId: row.userId,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      department: row.department,
      position: row.position,
      workStartMin: row.workStartMin,
      workEndMin: row.workEndMin,
      status: row.status,
      createdAtType: typeof row.createdAt,
      updatedAtType: typeof row.updatedAt,
      hasDeviceId: Boolean(row.deviceId),
    })),
    duplicateEmployeeCodes: duplicateCodes,
  }, null, 2));
} finally {
  await connection.end();
}
