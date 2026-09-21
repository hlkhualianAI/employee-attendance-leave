import mysql from "mysql2/promise";

const connection = await mysql.createConnection(process.env.DATABASE_URL!);
try {
  const tables = ["users", "employees", "attendance", "leaveRequests"];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS total FROM \`${table}\``);
    counts[table] = Number(rows[0]?.total ?? 0);
  }
  console.log(JSON.stringify({ counts, readOnly: true }, null, 2));
} finally {
  await connection.end();
}
