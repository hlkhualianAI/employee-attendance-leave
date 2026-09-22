import "dotenv/config";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const groupId = process.env.LINE_GROUP_ID;
const isDryRun = process.argv.includes("--dry-run");
const messageArgument = process.argv.find(argument => argument.startsWith("--message="));
const message = messageArgument
  ? messageArgument.slice("--message=".length).trim()
  : "ทดสอบแจ้งเตือนจากระบบ TIMEKEEP\nการเชื่อมต่อ LINE ทำงานปกติ";

function fail(messageText: string): never {
  console.error(`ไม่สามารถทดสอบ LINE ได้: ${messageText}`);
  process.exitCode = 1;
  throw new Error(messageText);
}

if (!token) fail("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
if (!groupId) fail("ยังไม่ได้ตั้งค่า LINE_GROUP_ID");
if (!message) fail("ข้อความทดสอบต้องไม่ว่าง");

const payload = {
  to: groupId,
  messages: [{ type: "text", text: message }],
};

if (isDryRun) {
  console.log("ตรวจสอบการตั้งค่าเท่านั้น (ยังไม่ส่งข้อความจริง)");
  console.log(`LINE_CHANNEL_ACCESS_TOKEN: ${token.slice(0, 6)}...${token.slice(-4)}`);
  console.log(`LINE_GROUP_ID: ${groupId}`);
  console.log(`ข้อความ: ${message}`);
  process.exit(0);
}

const response = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const detail = await response.text();
  fail(`LINE API ตอบกลับ HTTP ${response.status}: ${detail}`);
}

console.log("ส่ง LINE Notification สำเร็จ");
console.log(`กลุ่มปลายทาง: ${groupId}`);
console.log(`ข้อความ: ${message}`);
