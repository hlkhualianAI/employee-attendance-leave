type LineMessage = { type: "text"; text: string };

type EmployeeDetails = {
  employeeCode: string;
  fullName: string;
  department?: string;
  workStartMin?: number;
};

type LeaveDetails = {
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string | null;
};

const leaveLabels: Record<string, string> = {
  annual: "ลาพักร้อน",
  sick: "ลาป่วย",
  personal: "ลากิจ",
  other: "ลาอื่น ๆ",
};

function configured() {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_GROUP_ID);
}

function formatMinutes(minutes = 0) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} น.`;
}

async function sendLineGroupMessage(text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;
  if (!token || !groupId) {
    console.warn("[LINE] Notifications are disabled: missing LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID");
    return false;
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] satisfies LineMessage[] }),
    });
    if (!response.ok) {
      console.warn(`[LINE] Notification failed with HTTP ${response.status}: ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[LINE] Notification request failed:", error);
    return false;
  }
}

export function notifyLateCheckIn(employee: EmployeeDetails, workDate: string, checkInAt: number, lateMinutes: number) {
  if (lateMinutes <= 0) return Promise.resolve(false);
  const workStart = formatMinutes(employee.workStartMin);
  const checkIn = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(checkInAt));
  return sendLineGroupMessage([
    "แจ้งเตือนพนักงานมาสาย",
    `วันที่: ${workDate}`,
    `พนักงาน: ${employee.fullName}`,
    `รหัสพนักงาน: ${employee.employeeCode}`,
    `เวลาเริ่มงาน: ${workStart}`,
    `เวลาเช็คอิน: ${checkIn} น.`,
    `มาสาย: ${lateMinutes} นาที`,
  ].join("\n"));
}

export function notifyLeaveCreated(employee: EmployeeDetails, leave: LeaveDetails) {
  return sendLineGroupMessage([
    "แจ้งเตือนคำขอลาใหม่",
    `พนักงาน: ${employee.fullName}`,
    `รหัสพนักงาน: ${employee.employeeCode}`,
    `ประเภทลา: ${leaveLabels[leave.leaveType] ?? leave.leaveType}`,
    `ช่วงวันที่: ${leave.startDate} ถึง ${leave.endDate}`,
    `จำนวนวัน: ${leave.totalDays} วัน`,
    ...(leave.reason ? [`เหตุผล: ${leave.reason}`] : []),
  ].join("\n"));
}

export function notifyLeaveStatus(employee: EmployeeDetails, leave: LeaveDetails, status: "approved" | "rejected") {
  return sendLineGroupMessage([
    status === "approved" ? "แจ้งเตือนอนุมัติวันลา" : "แจ้งเตือนไม่อนุมัติวันลา",
    `พนักงาน: ${employee.fullName}`,
    `รหัสพนักงาน: ${employee.employeeCode}`,
    `ประเภทลา: ${leaveLabels[leave.leaveType] ?? leave.leaveType}`,
    `ช่วงวันที่: ${leave.startDate} ถึง ${leave.endDate}`,
    `จำนวนวัน: ${leave.totalDays} วัน`,
    `ผลการพิจารณา: ${status === "approved" ? "อนุมัติ" : "ไม่อนุมัติ"}`,
  ].join("\n"));
}

export { configured as isLineNotificationConfigured };
