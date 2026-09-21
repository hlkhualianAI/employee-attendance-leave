import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Link2,
  LogIn,
  LogOut,
  Navigation,
  Plane,
  Plus,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type AppRole = "admin" | "hr" | "employee";
type RoleSelect = AppRole;
type CheckInMode = "office" | "offsite";
type Coordinates = { latitude: number; longitude: number };

type UserRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | AppRole;
  lastSignedIn: Date;
};

type EmployeeRow = {
  id: number;
  userId: number | null;
  deviceId: string | null;
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  startDate: string;
  workStartMin: number;
  workEndMin: number;
  status: "active" | "inactive";
  createdAt: number;
  updatedAt: number;
};

type ReportAttendanceRow = {
  employeeCode: string;
  fullName: string;
  workDate: string;
  lateMinutes: number;
};
type ReportLeaveRow = {
  employeeCode: string;
  fullName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
};

const leaveTypeLabels = {
  annual: "ลาพักร้อน",
  sick: "ลาป่วย",
  personal: "ลากิจ",
  other: "ลาอื่น ๆ",
} as const;

const roleLabels: Record<AppRole, string> = {
  admin: "ผู้ดูแลระบบ",
  hr: "ฝ่ายบุคคล",
  employee: "พนักงานทั่วไป",
};

const roleDescriptions: Record<AppRole, string> = {
  admin: "จัดการสิทธิ์ ผู้ใช้ พนักงาน และข้อมูลทั้งหมด",
  hr: "จัดการพนักงาน เวลาเข้าออก และอนุมัติวันลา",
  employee: "ดูข้อมูลของตนเอง เช็คอิน และส่งคำขอลา",
};

const monthNames = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function bangkokDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    date
  );
}

function displayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00+07:00`);
  if (!date || Number.isNaN(parsed.getTime())) return "ไม่ระบุวันที่";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function displayTime(timestamp: number | null | undefined) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function tenureLabel(createdAt: number) {
  const start = new Date(createdAt);
  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    now.getMonth() -
    start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 1) return "อายุงานน้อยกว่า 1 เดือน";
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return years
    ? `${years} ปี${remainingMonths ? ` ${remainingMonths} เดือน` : ""}`
    : `${remainingMonths} เดือน`;
}

function getMonthKey(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(date);
  return formatted.replace("/", "-");
}

function calendarDateRange(startDate: string, endDate: string) {
  const [year, monthNumber, dayNumber] = startDate.split("-").map(Number);
  const [endYear, endMonthNumber, endDayNumber] = endDate
    .split("-")
    .map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, dayNumber));
  const last = new Date(Date.UTC(endYear, endMonthNumber - 1, endDayNumber));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const days: Array<string | null> = Array.from(
    { length: startOffset },
    () => null
  );
  for (
    let cursor = first.getTime();
    cursor <= last.getTime();
    cursor += 86400000
  ) {
    const current = new Date(cursor);
    days.push(
      `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`
    );
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function countWeekdays(startDate: string, endDate: string) {
  const parseDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  )
    return 0;
  let days = 0;
  for (
    let cursor = start.getTime();
    cursor <= end.getTime();
    cursor += 86400000
  ) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0) days += 1;
  }
  return days;
}

function statusLabel(status: string) {
  if (status === "approved")
    return { text: "อนุมัติแล้ว", className: "bg-emerald-50 text-emerald-700" };
  if (status === "rejected")
    return { text: "ไม่อนุมัติ", className: "bg-rose-50 text-rose-700" };
  return { text: "รอตรวจสอบ", className: "bg-amber-50 text-amber-700" };
}

function effectiveRole(role: string | undefined): AppRole {
  if (role === "admin") return "admin";
  if (role === "hr") return "hr";
  return "employee";
}

function getBrowserDeviceId() {
  const storageKey = "timekeep-device-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const deviceId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(storageKey, deviceId);
  return deviceId;
}

export default function Home() {
  const { user } = useAuth();
  const role = effectiveRole(user?.role);
  const isAdmin = role === "admin";
  const canManage = role === "admin" || role === "hr";
  const today = useMemo(() => bangkokDate(), []);
  const month = useMemo(() => getMonthKey(), []);
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [rangeStart, setRangeStart] = useState(`${month}-01`);
  const [rangeEnd, setRangeEnd] = useState(monthEnd(month));
  const [insightStart, setInsightStart] = useState(`${month}-01`);
  const [insightEnd, setInsightEnd] = useState(monthEnd(month));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "">("");
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    employeeCode: "",
    fullName: "",
    department: "",
    position: "",
    startDate: today,
  });
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    leaveType: "annual",
    startDate: today,
    endDate: today,
    reason: "",
  });
  const [checkInMode, setCheckInMode] = useState<CheckInMode>("office");
  const [offsiteReason, setOffsiteReason] = useState("");
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "requesting" | "ready" | "error"
  >("idle");
  const [location, setLocation] = useState<Coordinates | null>(null);

  const utils = trpc.useUtils();
  const employeesQuery = trpc.employees.list.useQuery();
  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: isAdmin });
  const summaryQuery = trpc.attendance.summary.useQuery({
    month: selectedMonth,
  });
  const todayQuery = trpc.attendance.byDate.useQuery({ workDate: today });
  const recentQuery = trpc.attendance.recent.useQuery();
  const leaveQuery = trpc.leave.list.useQuery();
  const reportQuery = trpc.attendance.reportRange.useQuery({
    startDate: rangeStart,
    endDate: rangeEnd,
  });
  const employeeInsightQuery = trpc.attendance.reportRange.useQuery({
    startDate: insightStart,
    endDate: insightEnd,
  });
  const exportQuery = trpc.attendance.reportRange.useQuery(
    { startDate: rangeStart, endDate: rangeEnd },
    { enabled: false }
  );

  const createEmployeeMutation = trpc.employees.create.useMutation({
    onSuccess: () => {
      toast.success("เพิ่มข้อมูลพนักงานแล้ว");
      setEmployeeForm({
        employeeCode: "",
        fullName: "",
        department: "",
        position: "",
        startDate: today,
      });
      setShowEmployeeForm(false);
      void utils.employees.list.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: error => toast.error(error.message || "เพิ่มพนักงานไม่สำเร็จ"),
  });

  const updateEmployeeMutation = trpc.employees.update.useMutation({
    onSuccess: () => {
      toast.success("แก้ไขข้อมูลพนักงานแล้ว");
      void utils.employees.list.invalidate();
    },
    onError: error => toast.error(error.message || "แก้ไขข้อมูลไม่สำเร็จ"),
  });

  const deleteEmployeeMutation = trpc.employees.delete.useMutation({
    onSuccess: () => {
      toast.success("ลบพนักงานออกจากรายชื่อใช้งานแล้ว");
      void utils.employees.list.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: error => toast.error(error.message || "ลบพนักงานไม่สำเร็จ"),
  });

  const checkInMutation = trpc.attendance.checkIn.useMutation({
    onSuccess: result => {
      toast.success(
        result.lateMinutes > 0
          ? `เช็คอินแล้ว · มาสาย ${result.lateMinutes} นาที`
          : "เช็คอินสำเร็จ · ตรงเวลา"
      );
      void utils.attendance.byDate.invalidate();
      void utils.attendance.recent.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: error => toast.error(error.message || "เช็คอินไม่สำเร็จ"),
  });

  const checkOutMutation = trpc.attendance.checkOut.useMutation({
    onSuccess: () => {
      toast.success("บันทึกเวลาเช็คเอาต์แล้ว");
      void utils.attendance.byDate.invalidate();
      void utils.attendance.recent.invalidate();
    },
    onError: error => toast.error(error.message || "เช็คเอาต์ไม่สำเร็จ"),
  });

  const createLeaveMutation = trpc.leave.create.useMutation({
    onSuccess: () => {
      toast.success("ส่งคำขอลาแล้ว");
      setShowLeaveForm(false);
      setLeaveForm({
        employeeId: "",
        leaveType: "annual",
        startDate: today,
        endDate: today,
        reason: "",
      });
      void utils.leave.list.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: error => toast.error(error.message || "ส่งคำขอลาไม่สำเร็จ"),
  });

  const updateLeaveMutation = trpc.leave.updateStatus.useMutation({
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "approved"
          ? "อนุมัติวันลาแล้ว"
          : "เปลี่ยนสถานะคำขอแล้ว"
      );
      void utils.leave.list.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: error => toast.error(error.message || "เปลี่ยนสถานะไม่สำเร็จ"),
  });

  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("อัปเดตสิทธิ์ผู้ใช้แล้ว");
      void utils.users.list.invalidate();
    },
    onError: error => toast.error(error.message || "อัปเดตสิทธิ์ไม่สำเร็จ"),
  });

  const linkUserMutation = trpc.employees.linkUser.useMutation({
    onSuccess: () => {
      toast.success("เชื่อมบัญชีกับโปรไฟล์พนักงานแล้ว");
      void utils.employees.list.invalidate();
    },
    onError: error => toast.error(error.message || "เชื่อมบัญชีไม่สำเร็จ"),
  });

  const resetDeviceMutation = trpc.employees.resetDevice.useMutation({
    onSuccess: () => {
      toast.success(
        "รีเซ็ตอุปกรณ์แล้ว พนักงานจะผูกอุปกรณ์ใหม่เมื่อเช็คอินครั้งถัดไป"
      );
      void utils.employees.list.invalidate();
    },
    onError: error => toast.error(error.message || "รีเซ็ตอุปกรณ์ไม่สำเร็จ"),
  });

  const employees = (employeesQuery.data ?? []) as EmployeeRow[];
  const users = (usersQuery.data ?? []) as UserRow[];

  useEffect(() => {
    if (
      role === "employee" &&
      employees[0] &&
      selectedEmployeeId !== employees[0].id
    ) {
      setSelectedEmployeeId(employees[0].id);
      setLeaveForm(current => ({
        ...current,
        employeeId: String(employees[0].id),
      }));
    }
  }, [employees, role, selectedEmployeeId]);

  const activeEmployeeId =
    selectedEmployeeId === "" && role === "employee"
      ? employees[0]?.id
      : selectedEmployeeId;
  const selectedEmployee = employees.find(
    employee => employee.id === activeEmployeeId
  );
  const todayAttendance = (todayQuery.data ?? []).find(
    item => item.employeeId === activeEmployeeId
  );
  const summary = reportQuery.data?.summary ??
    summaryQuery.data ?? {
      totalEmployees: 0,
      presentDays: 0,
      lateDays: 0,
      approvedLeaveDays: 0,
      pendingLeaves: 0,
    };
  const calendarDays = useMemo(
    () => calendarDateRange(rangeStart, rangeEnd),
    [rangeStart, rangeEnd]
  );
  const reportAttendance = reportQuery.data?.attendance ?? [];
  const reportLeaves = reportQuery.data?.leave ?? [];
  const isBusy =
    checkInMutation.isPending ||
    checkOutMutation.isPending ||
    locationStatus === "requesting";
  const currentMonthLabel =
    monthNames[Number(selectedMonth.split("-")[1]) - 1] ?? "เดือนนี้";
  const hasLinkedProfile = role !== "employee" || Boolean(selectedEmployee);

  function handleCheckIn() {
    if (!selectedEmployee) {
      toast.error("กรุณาเลือกพนักงานก่อนเช็คอิน");
      return;
    }
    if (checkInMode === "offsite" && !offsiteReason.trim()) {
      toast.error("กรุณาระบุเหตุผลที่ไปทำงานต่างจังหวัด");
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("error");
      toast.error("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      position => {
        const currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(currentLocation);
        setLocationStatus("ready");
        checkInMutation.mutate({
          employeeId: selectedEmployee.id,
          checkInMode,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          deviceId: getBrowserDeviceId(),
          note: checkInMode === "offsite" ? offsiteReason.trim() : undefined,
        });
      },
      error => {
        setLocationStatus("error");
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อเช็คอิน"
            : "ไม่สามารถอ่านตำแหน่งปัจจุบันได้"
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function submitEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createEmployeeMutation.mutate(employeeForm);
  }

  function submitLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const employeeId =
      role === "employee" ? selectedEmployee?.id : Number(leaveForm.employeeId);
    const totalDays = countWeekdays(leaveForm.startDate, leaveForm.endDate);
    if (!employeeId || totalDays < 1) {
      toast.error(
        role === "employee" && !selectedEmployee
          ? "บัญชีนี้ยังไม่ได้ผูกกับโปรไฟล์พนักงาน"
          : "กรุณาเลือกพนักงานและช่วงวันที่ถูกต้อง"
      );
      return;
    }
    createLeaveMutation.mutate({
      employeeId,
      leaveType: leaveForm.leaveType as
        | "annual"
        | "sick"
        | "personal"
        | "other",
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      totalDays,
      reason: leaveForm.reason || undefined,
    });
  }

  async function exportMonthlyReport() {
    try {
      const report = await exportQuery.refetch();
      if (!report.data) throw new Error("ไม่พบข้อมูลรายงาน");
      const attendanceRows = report.data.attendance.map(row => ({
        รหัสพนักงาน: row.employeeCode,
        ชื่อพนักงาน: row.fullName,
        แผนก: row.department,
        วันที่: row.workDate,
        เวลาเข้า: displayTime(row.checkInAt),
        เวลาออก: displayTime(row.checkOutAt),
        "มาสาย (นาที)": row.lateMinutes,
        รูปแบบ: row.checkInMode === "offsite" ? "ต่างจังหวัด" : "สำนักงาน",
        หมายเหตุ: row.note ?? "",
      }));
      const leaveRows = report.data.leave.map(row => ({
        รหัสพนักงาน: row.employeeCode,
        ชื่อพนักงาน: row.fullName,
        แผนก: row.department,
        ประเภทการลา: leaveTypeLabels[row.leaveType],
        เริ่มวันที่: row.startDate,
        ถึงวันที่: row.endDate,
        จำนวนวัน: row.totalDays,
        สถานะ: statusLabel(row.status).text,
        เหตุผล: row.reason ?? "",
      }));
      const summaryRows = [
        {
          รายการ: "เดือน",
          ค่า: `${displayDate(rangeStart)} - ${displayDate(rangeEnd)}`,
        },
        { รายการ: "พนักงานที่ใช้งาน", ค่า: report.data.summary.totalEmployees },
        { รายการ: "พนักงานมาทำงาน", ค่า: report.data.summary.presentDays },
        { รายการ: "รายการมาสาย", ค่า: report.data.summary.lateDays },
        {
          รายการ: "วันลาที่อนุมัติ",
          ค่า: report.data.summary.approvedLeaveDays,
        },
        { รายการ: "คำขอลารอตรวจสอบ", ค่า: report.data.summary.pendingLeaves },
      ];
      const dailyRows = calendarDateRange(rangeStart, rangeEnd)
        .filter(Boolean)
        .map(date => {
          const attendance = report.data.attendance.filter(
            row => row.workDate === date
          );
          const leaves = report.data.leave.filter(
            row => date! >= row.startDate && date! <= row.endDate
          );
          return {
            วันที่: date,
            วัน: new Intl.DateTimeFormat("th-TH", {
              weekday: "long",
              timeZone: "Asia/Bangkok",
            }).format(new Date(`${date}T00:00:00+07:00`)),
            "มาทำงาน (คน)": attendance.length,
            "มาสาย (คน)": attendance.filter(row => row.lateMinutes > 0).length,
            รายชื่อผู้มาสาย: attendance
              .filter(row => row.lateMinutes > 0)
              .map(row => `${row.fullName} (${row.lateMinutes} นาที)`)
              .join(", "),
            "ลา (รายการ)": leaves.length,
            รายชื่อผู้ลา: leaves
              .map(
                row =>
                  `${row.fullName} (${leaveTypeLabels[row.leaveType]} · ${statusLabel(row.status).text})`
              )
              .join(", "),
          };
        });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(summaryRows),
        "สรุป"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(attendanceRows),
        "การเข้างาน"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(leaveRows),
        "วันลา"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(dailyRows),
        "สรุปรายวัน"
      );
      XLSX.writeFile(workbook, `รายงานการทำงาน-${rangeStart}-${rangeEnd}.xlsx`);
      toast.success("ส่งออกไฟล์ Excel เรียบร้อยแล้ว");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ส่งออกไฟล์ไม่สำเร็จ"
      );
    }
  }

  return (
    <div className="min-h-[calc(100vh-2rem)] bg-[#f7f8f5] text-[#1f2a2a] -m-4 p-4 md:p-7 lg:p-9">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#5e746d]">
              <span className="h-2 w-2 rounded-full bg-[#d57945]" />
              TIMEKEEP / HR OPERATIONS
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1d3330] md:text-4xl">
                สวัสดี, {user?.name?.split(" ")[0] || "ผู้ใช้งาน"}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f1e9] px-3 py-1 text-xs font-semibold text-[#37705e]">
                <ShieldCheck className="h-3.5 w-3.5" />
                {roleLabels[role]}
              </span>
            </div>
            <p className="mt-2 text-sm text-[#6d7d79]">
              {roleDescriptions[role]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[#6d7d79]">
            <div className="rounded-2xl border border-[#dfe5df] bg-white px-4 py-2.5 shadow-[0_8px_25px_rgba(43,64,54,0.04)]">
              <span className="mr-2 text-[#9aa9a3]">วันนี้</span>
              <span className="font-semibold text-[#29443d]">
                {displayDate(today)}
              </span>
            </div>
            <Button
              variant="outline"
              className="border-[#dfe5df] bg-white text-[#5d756d]"
              onClick={exportMonthlyReport}
              disabled={exportQuery.isFetching}
            >
              <Download className="mr-2 h-4 w-4" />
              {exportQuery.isFetching ? "กำลังสร้าง..." : "Export Excel"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="border-[#dfe5df] bg-white text-[#5d756d]"
              onClick={() => {
                void utils.attendance.summary.invalidate();
                void utils.attendance.recent.invalidate();
                void utils.leave.list.invalidate();
              }}
              aria-label="รีเฟรชข้อมูล"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {role === "employee" && !hasLinkedProfile && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                บัญชียังไม่ได้ผูกกับโปรไฟล์พนักงาน
              </p>
              <p className="mt-1 text-xs leading-5">
                ติดต่อผู้ดูแลระบบหรือฝ่ายบุคคลเพื่อเชื่อมบัญชีของคุณกับข้อมูลพนักงานก่อนใช้งานเช็คอินและวันลา
              </p>
            </div>
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="relative overflow-hidden rounded-[28px] bg-[#173b38] p-7 text-white shadow-[0_18px_45px_rgba(24,59,56,0.16)] md:p-9">
            <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border-[30px] border-white/5" />
            <div className="absolute bottom-[-110px] right-24 h-56 w-56 rounded-full border-[26px] border-[#d57945]/15" />
            <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-end">
              <div className="max-w-xl">
                <div className="mb-5 flex items-center gap-3 text-sm font-medium text-[#b7d7ca]">
                  <Clock3 className="h-4 w-4" /> การลงเวลาประจำวัน
                </div>
                <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
                  ระบบลงข้อมูล
                  <br />
                  <span className="text-[#e5ad7e]">
                    การเข้าทำงานของหัวเหรียญขอนแก่น
                  </span>
                </h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-[#b4c9c0]">
                  {role === "employee"
                    ? "เช็คอินและเช็คเอาต์ของคุณได้จากที่นี่ ข้อมูลจะถูกบันทึกตามเวลาไทยและคำนวณการมาสายอัตโนมัติ"
                    : "เลือกพนักงานเพื่อบันทึกเวลาเข้าออก ระบบจะคำนวณเวลามาสายจากเวลาเริ่มงานของแต่ละคนโดยอัตโนมัติ"}
                </p>
              </div>
              <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <Label className="text-xs font-medium text-[#c5d9d0]">
                  พนักงานที่จะลงเวลา
                </Label>
                <select
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#244d49] px-3 text-sm text-white outline-none ring-offset-2 focus:ring-2 focus:ring-[#e5ad7e] disabled:cursor-not-allowed disabled:opacity-70"
                  value={activeEmployeeId ?? ""}
                  disabled={role === "employee" || !employees.length}
                  onChange={event =>
                    setSelectedEmployeeId(
                      event.target.value ? Number(event.target.value) : ""
                    )
                  }
                >
                  <option value="">
                    {employees.length
                      ? "เลือกพนักงาน"
                      : "ยังไม่มีโปรไฟล์พนักงาน"}
                  </option>
                  {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName} · {employee.employeeCode}
                    </option>
                  ))}
                </select>
                <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-[#e2eee8]">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checkInMode === "offsite"}
                      onChange={event => {
                        setCheckInMode(
                          event.target.checked ? "offsite" : "office"
                        );
                        setLocationStatus("idle");
                      }}
                      className="h-4 w-4 accent-[#e5ad7e]"
                    />
                    <Plane className="h-3.5 w-3.5 text-[#e5ad7e]" />{" "}
                    ไปทำงานต่างจังหวัด
                  </span>
                  <span className="text-[10px] text-[#b4c9c0]">
                    {checkInMode === "offsite" ? "นอกสำนักงาน" : "ในสำนักงาน"}
                  </span>
                </label>
                {checkInMode === "offsite" && (
                  <Input
                    value={offsiteReason}
                    onChange={event => setOffsiteReason(event.target.value)}
                    placeholder="เหตุผล / จังหวัดที่ไป"
                    className="mt-2 border-white/10 bg-[#244d49] text-white placeholder:text-[#9bbab0]"
                  />
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    className="flex-1 bg-[#e5ad7e] text-[#273c37] hover:bg-[#f0bd93]"
                    disabled={
                      !selectedEmployee ||
                      isBusy ||
                      (checkInMode === "offsite" && !offsiteReason.trim())
                    }
                    onClick={handleCheckIn}
                  >
                    <Navigation className="mr-2 h-4 w-4" />{" "}
                    {locationStatus === "requesting"
                      ? "กำลังค้นหา..."
                      : "เช็คอิน"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    disabled={!todayAttendance?.checkInAt || isBusy}
                    onClick={() =>
                      checkOutMutation.mutate({
                        employeeId: selectedEmployee!.id,
                      })
                    }
                  >
                    <LogOut className="mr-2 h-4 w-4" /> เช็คเอาต์
                  </Button>
                </div>
                {selectedEmployee && (
                  <p className="mt-3 text-xs text-[#b4c9c0]">
                    เวลาเริ่มงาน{" "}
                    {String(
                      Math.floor(selectedEmployee.workStartMin / 60)
                    ).padStart(2, "0")}
                    :
                    {String(selectedEmployee.workStartMin % 60).padStart(
                      2,
                      "0"
                    )}{" "}
                    น.{" "}
                    {todayAttendance?.checkInAt
                      ? `· เข้าแล้ว ${displayTime(todayAttendance.checkInAt)}`
                      : locationStatus === "ready" && location
                        ? "· พบตำแหน่ง GPS แล้ว"
                        : "· ต้องอนุญาต GPS ก่อนเช็คอิน"}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              label={role === "employee" ? "โปรไฟล์ของฉัน" : "พนักงานที่ใช้งาน"}
              value={summary.totalEmployees}
              suffix={role === "employee" ? "รายการ" : "คน"}
              icon={<Users className="h-5 w-5" />}
              tone="sage"
            />
            <MetricCard
              label="พนักงานมาทำงาน"
              value={summary.presentDays}
              suffix="รายการ"
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="blue"
            />
            <MetricCard
              label="มาสาย"
              value={summary.lateDays}
              suffix="รายการ"
              icon={<AlarmClock className="h-5 w-5" />}
              tone="orange"
            />
            <MetricCard
              label="วันลาที่อนุมัติ"
              value={summary.approvedLeaveDays}
              suffix="วัน"
              icon={<CalendarDays className="h-5 w-5" />}
              tone="purple"
            />
          </div>
        </section>

        <section className="rounded-[24px] border border-[#dfe8df] bg-white p-6 shadow-[0_12px_35px_rgba(43,64,54,0.045)]">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#91a19a]">
                ช่วงเวลาและปฏิทิน
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
                ภาพรวมการมาทำงานและวันลา
              </h2>
              <p className="mt-1 text-sm text-[#7b8981]">
                กำหนดช่วงวันที่เพื่อดูข้อมูลวันจันทร์–เสาร์ เวลา 08:30–17:30 และวันลาในปฏิทินเดียว
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm font-medium text-[#526b61]">
              เลือกเดือน
              <Input type="month" value={selectedMonth} onChange={event => { const nextMonth = event.target.value || month; setSelectedMonth(nextMonth); setRangeStart(`${nextMonth}-01`); setRangeEnd(monthEnd(nextMonth)); }} className="h-10 w-[165px] border-[#dfe8df]" />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-xs text-[#6d7d79]">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#f7b27b]" />
              มาสาย
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#9da9e8]" />
              ลา
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#80c69a]" />
              มาทำงาน
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[#8d9b94]">
                {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map(day => (
                  <div key={day} className="py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((date, index) => {
                  const attendance = date
                    ? reportAttendance.filter(row => row.workDate === date)
                    : [];
                  const leaves = date
                    ? reportLeaves.filter(
                        row => date >= row.startDate && date <= row.endDate
                      )
                    : [];
                  return (
                    <div
                      key={date ?? `blank-${index}`}
                      className={`min-h-[96px] rounded-xl border p-2 ${date ? "border-[#edf1ed] bg-[#fcfdfb]" : "border-transparent bg-transparent"}`}
                    >
                      {date && (
                        <>
                          <p className="text-xs font-semibold text-[#60756d]">
                            {Number(date.slice(-2))}
                          </p>
                          <div className="mt-2 space-y-1">
                            {attendance
                              .filter(row => row.lateMinutes > 0)
                              .slice(0, 3)
                              .map(row => (
                                <div
                                  key={`late-${row.employeeCode}`}
                                  className="truncate rounded-md bg-[#fff1e6] px-1.5 py-1 text-[10px] font-semibold text-[#b76632]"
                                  title={`${row.fullName} · สาย ${row.lateMinutes} นาที`}
                                >
                                  สาย · {row.fullName}
                                </div>
                              ))}
                            {attendance
                              .filter(row => row.lateMinutes <= 0)
                              .slice(0, 2)
                              .map(row => (
                                <div
                                  key={`present-${row.employeeCode}`}
                                  className="truncate rounded-md bg-[#edf8f0] px-1.5 py-1 text-[10px] font-medium text-[#398157]"
                                  title={row.fullName}
                                >
                                  เข้า · {row.fullName}
                                </div>
                              ))}
                            {leaves.slice(0, 2).map(row => (
                              <div
                                key={`leave-${row.employeeCode}-${row.startDate}`}
                                className={`truncate rounded-md px-1.5 py-1 text-[10px] font-semibold ${row.status === "approved" ? "bg-[#eef0ff] text-[#626ca8]" : "bg-[#f3f0ff] text-[#8174ae]"}`}
                                title={`${row.fullName} · ${leaveTypeLabels[row.leaveType]} · ${statusLabel(row.status).text}`}
                              >
                                ลา · {row.fullName}
                              </div>
                            ))}
                            {attendance.filter(row => row.lateMinutes > 0)
                              .length > 3 && (
                              <p className="text-[10px] text-[#a28c7c]">
                                +
                                {attendance.filter(row => row.lateMinutes > 0)
                                  .length - 3}{" "}
                                รายการ
                              </p>
                            )}
                            {leaves.length > 2 && (
                              <p className="text-[10px] text-[#8c86a5]">
                                +{leaves.length - 2} วันลา
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {reportQuery.isLoading && (
            <p className="mt-3 text-xs text-[#8b9a92]">
              กำลังโหลดข้อมูลของเดือนที่เลือก...
            </p>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[24px] border border-[#e4e9e4] bg-white p-6 shadow-[0_12px_35px_rgba(43,64,54,0.045)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#91a19a]">
                  ล่าสุด
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
                  {role === "employee"
                    ? "ประวัติการลงเวลาของฉัน"
                    : "การลงเวลาเข้าออก"}
                </h2>
              </div>
              <div className="rounded-full bg-[#f3f6f1] px-3 py-1.5 text-xs font-medium text-[#6d7d79]">
                {currentMonthLabel} {month.split("-")[0]}
              </div>
            </div>
            {recentQuery.isLoading ? (
              <LoadingRows />
            ) : recentQuery.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#edf0ed] text-xs font-medium text-[#99a69f]">
                      <th className="pb-3 font-medium">พนักงาน</th>
                      <th className="pb-3 font-medium">วันที่</th>
                      <th className="pb-3 font-medium">เข้า</th>
                      <th className="pb-3 font-medium">ออก</th>
                      <th className="pb-3 text-right font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentQuery.data.map(record => (
                      <tr
                        key={record.id}
                        className="border-b border-[#f1f3f0] last:border-0"
                      >
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf3ed] text-xs font-bold text-[#5d786d]">
                              {record.fullName.slice(0, 1)}
                            </div>
                            <div>
                              <p className="font-semibold text-[#314943]">
                                {record.fullName}
                              </p>
                              <p className="text-xs text-[#9aa8a1]">
                                {record.employeeCode} · {record.department}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-[#6d7d79]">
                          {displayDate(record.workDate)}
                        </td>
                        <td className="py-4 font-medium text-[#314943]">
                          {displayTime(record.checkInAt)}
                        </td>
                        <td className="py-4 text-[#6d7d79]">
                          {displayTime(record.checkOutAt)}
                        </td>
                        <td className="py-4 text-right">
                          {record.lateMinutes > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3e9] px-2.5 py-1 text-xs font-semibold text-[#b85f2d]">
                              <AlarmClock className="h-3.5 w-3.5" /> สาย{" "}
                              {record.lateMinutes} นาที
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#edf8f0] px-2.5 py-1 text-xs font-semibold text-[#348354]">
                              <Check className="h-3.5 w-3.5" /> ตรงเวลา
                            </span>
                          )}{" "}
                          {record.checkInMode === "offsite" && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#eef0ff] px-2 py-1 text-[11px] font-semibold text-[#626ca8]">
                              <Plane className="h-3 w-3" /> ต่างจังหวัด
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<Clock3 />}
                title="ยังไม่มีรายการลงเวลา"
                detail={
                  role === "employee"
                    ? "เริ่มเช็คอินเพื่อสร้างประวัติของคุณ"
                    : "เพิ่มพนักงานและเริ่มเช็คอินเพื่อดูข้อมูลที่นี่"
                }
              />
            )}
          </div>

          <div className="rounded-[24px] border border-[#e4e9e4] bg-[#fffdf9] p-6 shadow-[0_12px_35px_rgba(43,64,54,0.045)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b5a18f]">
                  ต้องติดตาม
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
                  {role === "employee" ? "คำขอลาของฉัน" : "คำขอลา"}
                </h2>
              </div>
              <span className="rounded-full bg-[#fff1df] px-3 py-1.5 text-xs font-semibold text-[#b66c35]">
                {summary.pendingLeaves} รอตรวจสอบ
              </span>
            </div>
            <div className="space-y-3">
              {leaveQuery.isLoading ? (
                <LoadingRows />
              ) : leaveQuery.data?.length ? (
                leaveQuery.data.slice(0, 5).map(request => {
                  const status = statusLabel(request.status);
                  return (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-[#f0ebe3] bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#354a43]">
                            {request.fullName}
                          </p>
                          <p className="mt-0.5 text-xs text-[#9b9d94]">
                            {leaveTypeLabels[request.leaveType]} ·{" "}
                            {request.totalDays} วัน
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}
                        >
                          {status.text}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-[#7c8981]">
                        {displayDate(request.startDate)} —{" "}
                        {displayDate(request.endDate)}
                      </p>
                      {canManage && request.status === "pending" && (
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            className="h-8 flex-1 bg-[#2f7564] text-xs hover:bg-[#276355]"
                            onClick={() =>
                              updateLeaveMutation.mutate({
                                id: request.id,
                                status: "approved",
                              })
                            }
                          >
                            <Check className="mr-1.5 h-3.5 w-3.5" /> อนุมัติ
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-[#efd9d5] text-xs text-[#bd6b63] hover:bg-[#fff4f2] hover:text-[#a8564e]"
                            onClick={() =>
                              updateLeaveMutation.mutate({
                                id: request.id,
                                status: "rejected",
                              })
                            }
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" /> ไม่อนุมัติ
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon={<CalendarDays />}
                  title="ยังไม่มีคำขอลา"
                  detail="คำขอใหม่จะแสดงในส่วนนี้"
                />
              )}
            </div>
            <Button
              variant="ghost"
              className="mt-4 w-full justify-between text-[#4d7166] hover:bg-[#f5f8f4] hover:text-[#2f5b50]"
              onClick={() => setShowLeaveForm(value => !value)}
            >
              {showLeaveForm ? "ปิดแบบฟอร์ม" : "สร้างคำขอลา"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
          {canManage ? (
            <div className="rounded-[24px] border border-dashed border-[#cbd9d0] bg-[#f3f8f3] p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#789288]">
                    ทีมของคุณ
                  </p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
                    จัดการพนักงาน
                  </h2>
                </div>
                <div className="rounded-xl bg-white p-2 text-[#5d8b78]">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#6d8179]">
                เพิ่มรายชื่อพนักงานและกำหนดเวลาเริ่มงาน
                เพื่อให้ระบบคำนวณการมาสายได้ตรงตามจริง
              </p>
              <Button
                className="mt-5 bg-[#2f7564] hover:bg-[#276355]"
                onClick={() => setShowEmployeeForm(value => !value)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {showEmployeeForm ? "ปิดแบบฟอร์ม" : "เพิ่มพนักงาน"}
              </Button>
              {showEmployeeForm && (
                <form
                  onSubmit={submitEmployee}
                  className="mt-5 space-y-3 border-t border-[#dce8de] pt-5"
                >
                  <FormField label="รหัสพนักงาน">
                    <Input
                      required
                      value={employeeForm.employeeCode}
                      onChange={event =>
                        setEmployeeForm({
                          ...employeeForm,
                          employeeCode: event.target.value,
                        })
                      }
                      placeholder="เช่น EMP-001"
                    />
                  </FormField>
                  <FormField label="ชื่อ-นามสกุล">
                    <Input
                      required
                      value={employeeForm.fullName}
                      onChange={event =>
                        setEmployeeForm({
                          ...employeeForm,
                          fullName: event.target.value,
                        })
                      }
                      placeholder="ชื่อพนักงาน"
                    />
                  </FormField>
                  <FormField label="วันเริ่มงาน">
                    <Input
                      required
                      type="date"
                      value={employeeForm.startDate}
                      onChange={event =>
                        setEmployeeForm({
                          ...employeeForm,
                          startDate: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="แผนก">
                      <Input
                        required
                        value={employeeForm.department}
                        onChange={event =>
                          setEmployeeForm({
                            ...employeeForm,
                            department: event.target.value,
                          })
                        }
                        placeholder="เช่น ฝ่ายขาย"
                      />
                    </FormField>
                    <FormField label="ตำแหน่ง">
                      <Input
                        required
                        value={employeeForm.position}
                        onChange={event =>
                          setEmployeeForm({
                            ...employeeForm,
                            position: event.target.value,
                          })
                        }
                        placeholder="เช่น Sales Executive"
                      />
                    </FormField>
                  </div>
                  <Button
                    type="submit"
                    disabled={createEmployeeMutation.isPending}
                    className="w-full bg-[#2f7564] hover:bg-[#276355]"
                  >
                    บันทึกข้อมูลพนักงาน
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#cbd9d0] bg-[#f3f8f3] p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#789288]">
                    บัญชีของฉัน
                  </p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
                    ข้อมูลโปรไฟล์
                  </h2>
                </div>
                <div className="rounded-xl bg-white p-2 text-[#5d8b78]">
                  <UserRoundCog className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#6d8179]">
                บัญชีพนักงานทั่วไปจะเห็นเฉพาะเวลาเข้าออกและคำขอลาของตนเองเท่านั้น
              </p>
              {selectedEmployee ? (
                <div className="mt-5 rounded-2xl border border-[#dce8de] bg-white p-4">
                  <p className="font-semibold text-[#35554b]">
                    {selectedEmployee.fullName}
                  </p>
                  <p className="mt-1 text-xs text-[#789288]">
                    {selectedEmployee.employeeCode} ·{" "}
                    {selectedEmployee.department}
                  </p>
                  <p className="mt-3 text-xs text-[#8b9a92]">
                    เวลาเริ่มงาน{" "}
                    {String(
                      Math.floor(selectedEmployee.workStartMin / 60)
                    ).padStart(2, "0")}
                    :
                    {String(selectedEmployee.workStartMin % 60).padStart(
                      2,
                      "0"
                    )}{" "}
                    น.
                  </p>
                </div>
              ) : (
                <p className="mt-5 rounded-2xl bg-white p-4 text-xs text-[#9b7a42]">
                  รอผู้ดูแลผูกบัญชีกับโปรไฟล์พนักงาน
                </p>
              )}
            </div>
          )}

          {showLeaveForm ? (
            <div className="rounded-[24px] border border-[#eadfce] bg-[#fffdf9] p-6">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b5a18f]">
                    NEW REQUEST
                  </p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
                    สร้างคำขอลา
                  </h2>
                </div>
                <button
                  className="rounded-lg p-2 text-[#9b9d94] hover:bg-[#f6f0e8]"
                  onClick={() => setShowLeaveForm(false)}
                  aria-label="ปิด"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                onSubmit={submitLeave}
                className="grid gap-4 md:grid-cols-2"
              >
                <FormField label="พนักงาน">
                  <select
                    required
                    disabled={role === "employee"}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                    value={
                      role === "employee"
                        ? (selectedEmployee?.id ?? "")
                        : leaveForm.employeeId
                    }
                    onChange={event =>
                      setLeaveForm({
                        ...leaveForm,
                        employeeId: event.target.value,
                      })
                    }
                  >
                    <option value="">เลือกพนักงาน</option>
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="ประเภทการลา">
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={leaveForm.leaveType}
                    onChange={event =>
                      setLeaveForm({
                        ...leaveForm,
                        leaveType: event.target.value,
                      })
                    }
                  >
                    <option value="annual">ลาพักร้อน</option>
                    <option value="sick">ลาป่วย</option>
                    <option value="personal">ลากิจ</option>
                    <option value="other">ลาอื่น ๆ</option>
                  </select>
                </FormField>
                <FormField label="วันที่เริ่มลา">
                  <Input
                    type="date"
                    required
                    value={leaveForm.startDate}
                    onChange={event =>
                      setLeaveForm({
                        ...leaveForm,
                        startDate: event.target.value,
                      })
                    }
                  />
                </FormField>
                <FormField label="วันที่สิ้นสุด">
                  <Input
                    type="date"
                    required
                    value={leaveForm.endDate}
                    onChange={event =>
                      setLeaveForm({
                        ...leaveForm,
                        endDate: event.target.value,
                      })
                    }
                  />
                </FormField>
                <div className="md:col-span-2">
                  <FormField label="เหตุผล (ถ้ามี)">
                    <Textarea
                      value={leaveForm.reason}
                      onChange={event =>
                        setLeaveForm({
                          ...leaveForm,
                          reason: event.target.value,
                        })
                      }
                      placeholder="ระบุรายละเอียดเพิ่มเติม"
                      rows={3}
                    />
                  </FormField>
                </div>
                <div className="flex items-center justify-between md:col-span-2">
                  <p className="text-xs text-[#8b958e]">
                    ระบบจะนับเฉพาะวันจันทร์–ศุกร์ ·{" "}
                    {countWeekdays(leaveForm.startDate, leaveForm.endDate)}{" "}
                    วันทำการ
                  </p>
                  <Button
                    type="submit"
                    disabled={
                      createLeaveMutation.isPending || !hasLinkedProfile
                    }
                    className="bg-[#d57945] text-white hover:bg-[#bd6635]"
                  >
                    ส่งคำขอลา
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex flex-col justify-between rounded-[24px] bg-[#e8f0e8] p-6 md:flex-row md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#789288]">
                  พร้อมสำหรับทีม
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
                  จัดการวันลาได้ง่ายขึ้น
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-[#6d8179]">
                  บันทึกคำขอลา ตรวจสอบเหตุผล และอนุมัติได้จากหน้าภาพรวมเดียว
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-5 w-fit border-[#bcd0c3] bg-white text-[#356b5c] hover:bg-[#f6fbf5] md:mt-0"
                onClick={() => setShowLeaveForm(true)}
              >
                สร้างคำขอลา <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </section>

        {canManage && (
          <EmployeeManagementCard
            employees={employees}
            onUpdate={input => updateEmployeeMutation.mutate(input)}
            onDelete={id => deleteEmployeeMutation.mutate({ id })}
            isPending={
              updateEmployeeMutation.isPending ||
              deleteEmployeeMutation.isPending
            }
          />
        )}
        <EmployeeInsightsCard
          employees={employees}
          attendance={(employeeInsightQuery.data?.attendance ?? []) as ReportAttendanceRow[]}
          leaves={(employeeInsightQuery.data?.leave ?? []) as ReportLeaveRow[]}
          startDate={insightStart}
          endDate={insightEnd}
          onRangeChange={(nextStart, nextEnd) => {
            setInsightStart(nextStart);
            setInsightEnd(nextEnd);
          }}
        />
        {isAdmin && (
          <RoleManagementCard
            users={users}
            employees={employees}
            onRoleChange={(id, nextRole) =>
              updateRoleMutation.mutate({ id, role: nextRole })
            }
            onLinkUser={(employeeId, userId) =>
              linkUserMutation.mutate({ employeeId, userId })
            }
            isPending={
              updateRoleMutation.isPending || linkUserMutation.isPending
            }
          />
        )}
        {canManage && (
          <DeviceBindingCard
            employees={employees}
            onReset={employeeId => resetDeviceMutation.mutate({ employeeId })}
            isPending={resetDeviceMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

function EmployeeInsightsCard({
  employees,
  attendance,
  leaves,
  startDate,
  endDate,
  onRangeChange,
}: {
  employees: EmployeeRow[];
  attendance: ReportAttendanceRow[];
  leaves: ReportLeaveRow[];
  startDate: string;
  endDate: string;
  onRangeChange: (startDate: string, endDate: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState<number | "">(employees[0]?.id ?? "");
  const employee = employees.find(row => row.id === employeeId) ?? employees[0];
  if (!employee) return null;
  const employeeAttendance = attendance.filter(row => row.employeeCode === employee.employeeCode);
  const employeeLeaves = leaves.filter(row => row.employeeCode === employee.employeeCode);
  const leaveDays = employeeLeaves.filter(row => row.status === "approved").reduce((sum, row) => sum + row.totalDays, 0);
  return <section className="rounded-[24px] border border-[#d9e2df] bg-[#f8fbf8] p-6 shadow-[0_12px_35px_rgba(43,64,54,0.04)]"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f8b80]">EMPLOYEE INSIGHTS</p><h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">ข้อมูลพนักงานรายบุคคล</h2><p className="mt-1 text-sm text-[#6d8179]">กำหนดช่วงวันที่เพื่อดูสถิติเฉพาะบุคคล</p></div><div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto"><Input type="date" value={startDate} onChange={event => onRangeChange(event.target.value, endDate)} /><Input type="date" value={endDate} onChange={event => onRangeChange(startDate, event.target.value)} /></div></div><div className="mt-4"><select className="h-10 w-full rounded-lg border border-[#dfe8e0] bg-white px-3 text-sm text-[#43685b] outline-none md:w-64" value={employee.id} onChange={event => setEmployeeId(Number(event.target.value))}>{employees.filter(row => row.status === "active").map(row => <option key={row.id} value={row.id}>{row.fullName} · {row.employeeCode}</option>)}</select></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#8b9a92]">อายุงาน</p><p className="mt-2 font-semibold text-[#35554b]">{tenureLabel(new Date(`${employee.startDate}T00:00:00+07:00`).getTime())}</p></div><div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#8b9a92]">วันเริ่มงาน</p><p className="mt-2 font-semibold text-[#35554b]">{displayDate(employee.startDate)}</p></div><div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#8b9a92]">พนักงานมาทำงาน</p><p className="mt-2 font-semibold text-[#35554b]">{employeeAttendance.length} วัน</p></div><div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#8b9a92]">วันมาสาย</p><p className="mt-2 font-semibold text-[#b76632]">{employeeAttendance.filter(row => row.lateMinutes > 0).length} วัน</p></div><div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#8b9a92]">วันลาอนุมัติ</p><p className="mt-2 font-semibold text-[#626ca8]">{leaveDays} วัน</p></div></div></section>;
}

function EmployeeManagementCard({
  employees,
  onUpdate,
  onDelete,
  isPending,
}: {
  employees: EmployeeRow[];
  onUpdate: (input: {
    id: number;
    employeeCode: string;
    fullName: string;
    department: string;
    position: string;
    startDate: string;
  }) => void;
  onDelete: (id: number) => void;
  isPending: boolean;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    employeeCode: "",
    fullName: "",
    department: "",
    position: "",
    startDate: "",
  });
  const activeEmployees = employees.filter(
    employee => employee.status === "active"
  );
  const startEdit = (employee: EmployeeRow) => {
    setEditingId(employee.id);
    setDraft({
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: employee.department,
      position: employee.position,
      startDate: employee.startDate,
    });
  };
  return (
    <section className="rounded-[24px] border border-[#d9e2df] bg-white p-6 shadow-[0_12px_35px_rgba(43,64,54,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f8b80]">
            EMPLOYEE DIRECTORY
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
            แก้ไขและลบพนักงาน
          </h2>
          <p className="mt-2 text-sm text-[#6d8179]">
            การลบจะปิดสถานะการใช้งานและเก็บประวัติการลงเวลาเดิมไว้
          </p>
        </div>
        <Users className="h-5 w-5 text-[#4e806f]" />
      </div>
      <div className="mt-5 space-y-3">
        {activeEmployees.map(employee =>
          editingId === employee.id ? (
            <div
              key={employee.id}
              className="grid gap-3 rounded-2xl border border-[#dce8de] bg-[#f8fbf8] p-4 md:grid-cols-4"
            >
              <Input
                value={draft.employeeCode}
                onChange={event =>
                  setDraft({ ...draft, employeeCode: event.target.value })
                }
                placeholder="รหัสพนักงาน"
              />
              <Input
                value={draft.fullName}
                onChange={event =>
                  setDraft({ ...draft, fullName: event.target.value })
                }
                placeholder="ชื่อ-นามสกุล"
              />
              <Input
                value={draft.department}
                onChange={event =>
                  setDraft({ ...draft, department: event.target.value })
                }
                placeholder="แผนก"
              />
              <Input
                value={draft.position}
                onChange={event =>
                  setDraft({ ...draft, position: event.target.value })
                }
                placeholder="ตำแหน่ง"
              />
              <Input
                type="date"
                value={draft.startDate}
                onChange={event =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
              />
              <div className="flex gap-2 md:col-span-4">
                <Button
                  disabled={isPending}
                  className="bg-[#2f7564] hover:bg-[#276355]"
                  onClick={() => {
                    onUpdate({ id: employee.id, ...draft });
                    setEditingId(null);
                  }}
                >
                  บันทึก
                </Button>
                <Button variant="outline" onClick={() => setEditingId(null)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={employee.id}
              className="flex flex-col gap-3 rounded-2xl border border-[#edf1ed] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-[#35554b]">
                  {employee.fullName}
                </p>
                <p className="mt-1 text-xs text-[#8b9a92]">
                  {employee.employeeCode} · {employee.department} ·{" "}
                  {employee.position} · เริ่มงาน {displayDate(employee.startDate)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#cfe0d5] text-[#477461]"
                  onClick={() => startEdit(employee)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  แก้ไข
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#efd9d5] text-[#bd6b63] hover:bg-[#fff4f2]"
                  disabled={isPending}
                  onClick={() => {
                    if (
                      window.confirm(`ยืนยันลบ ${employee.fullName} หรือไม่?`)
                    )
                      onDelete(employee.id);
                  }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  ลบ
                </Button>
              </div>
            </div>
          )
        )}
        {!activeEmployees.length && (
          <p className="rounded-2xl bg-[#f7faf7] p-4 text-sm text-[#81918a]">
            ยังไม่มีพนักงานที่ใช้งานอยู่
          </p>
        )}
      </div>
    </section>
  );
}

function RoleManagementCard({
  users,
  employees,
  onRoleChange,
  onLinkUser,
  isPending,
}: {
  users: UserRow[];
  employees: EmployeeRow[];
  onRoleChange: (id: number, role: RoleSelect) => void;
  onLinkUser: (employeeId: number, userId: number | null) => void;
  isPending: boolean;
}) {
  const [linkEmployeeId, setLinkEmployeeId] = useState("");
  const [linkUserId, setLinkUserId] = useState("");
  return (
    <section className="rounded-[24px] border border-[#d9e2df] bg-[#eef5f1] p-6 shadow-[0_12px_35px_rgba(43,64,54,0.04)]">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f8b80]">
            ADMIN ONLY
          </p>
          <h2 className="mt-1 flex items-center gap-2 font-display text-xl font-semibold text-[#29443d]">
            <ShieldCheck className="h-5 w-5 text-[#3c7c69]" />
            จัดการสิทธิ์การใช้งาน
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d8179]">
            กำหนดบทบาทให้บัญชีผู้ใช้
            และเชื่อมบัญชีเข้ากับโปรไฟล์พนักงานเพื่อจำกัดการเห็นข้อมูลอย่างถูกต้อง
          </p>
        </div>
        <div className="rounded-xl bg-white p-3 text-[#4e806f]">
          <UserRoundCog className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-[#dce8de] bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-[#35554b]">
            บัญชีผู้ใช้และบทบาท
          </p>
          <div className="space-y-2">
            {users.length ? (
              users.map(account => (
                <div
                  key={account.id}
                  className="flex flex-col gap-3 rounded-xl border border-[#edf1ed] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#3a554b]">
                      {account.name || "ไม่มีชื่อ"}
                    </p>
                    <p className="truncate text-xs text-[#8b9a92]">
                      {account.email || "ไม่มีอีเมล"}
                    </p>
                  </div>
                  <select
                    className="h-9 rounded-lg border border-[#dfe8e0] bg-white px-2 text-xs font-medium text-[#43685b] outline-none focus:ring-2 focus:ring-[#8bb9a8]"
                    value={account.role === "user" ? "employee" : account.role}
                    disabled={isPending}
                    onChange={event =>
                      onRoleChange(account.id, event.target.value as RoleSelect)
                    }
                  >
                    <option value="admin">ผู้ดูแลระบบ</option>
                    <option value="hr">ฝ่ายบุคคล</option>
                    <option value="employee">พนักงานทั่วไป</option>
                  </select>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-[#9aa69f]">
                ยังไม่พบบัญชีผู้ใช้
              </p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[#dce8de] bg-white p-4">
          <p className="mb-1 text-sm font-semibold text-[#35554b]">
            เชื่อมบัญชีกับพนักงาน
          </p>
          <p className="mb-4 text-xs leading-5 text-[#8b9a92]">
            พนักงานทั่วไปต้องมีการเชื่อมบัญชีจึงจะเห็นข้อมูลของตนเอง
          </p>
          <div className="space-y-3">
            <FormField label="โปรไฟล์พนักงาน">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={linkEmployeeId}
                onChange={event => setLinkEmployeeId(event.target.value)}
              >
                <option value="">เลือกพนักงาน</option>
                {employees.map(employee => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} · {employee.employeeCode}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="บัญชีผู้ใช้">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={linkUserId}
                onChange={event => setLinkUserId(event.target.value)}
              >
                <option value="">เลือกบัญชี</option>
                {users.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name || account.email || `User #${account.id}`}
                    </option>
                  ))}
              </select>
            </FormField>
            <Button
              className="w-full bg-[#2f7564] hover:bg-[#276355]"
              disabled={!linkEmployeeId || !linkUserId || isPending}
              onClick={() =>
                onLinkUser(Number(linkEmployeeId), Number(linkUserId))
              }
            >
              <Link2 className="mr-2 h-4 w-4" />
              เชื่อมบัญชี
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DeviceBindingCard({
  employees,
  onReset,
  isPending,
}: {
  employees: EmployeeRow[];
  onReset: (employeeId: number) => void;
  isPending: boolean;
}) {
  return (
    <section className="rounded-[24px] border border-[#e4e9e4] bg-white p-6 shadow-[0_12px_35px_rgba(43,64,54,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#91a19a]">
            SECURITY CONTROL
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">
            อุปกรณ์ที่ใช้เช็คอิน
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#6d8179]">
            ระบบจะผูกอุปกรณ์แรกของพนักงานไว้ และปฏิเสธการเช็คอินจากอุปกรณ์อื่น
            ผู้ดูแลสามารถลบอุปกรณ์ที่ผูกไว้ได้เมื่อพนักงานเปลี่ยนเครื่อง
          </p>
        </div>
        <div className="rounded-xl bg-[#f3f8f3] p-3 text-[#4e806f]">
          <ShieldCheck className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {employees.length ? (
          employees.map(employee => (
            <div
              key={employee.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[#edf1ed] p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#3a554b]">
                  {employee.fullName}
                </p>
                <p className="mt-1 text-xs text-[#8b9a92]">
                  {employee.employeeCode} ·{" "}
                  {employee.deviceId ? "ผูกอุปกรณ์แล้ว" : "ยังไม่ผูกอุปกรณ์"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!employee.deviceId || isPending}
                onClick={() => {
                  if (window.confirm(`ลบอุปกรณ์ของ ${employee.fullName} หรือไม่?`))
                    onReset(employee.id);
                }}
                className="shrink-0 border-[#dfe8e0] text-xs text-[#4d7166]"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                ลบอุปกรณ์
              </Button>
            </div>
          ))
        ) : (
          <p className="col-span-full py-4 text-center text-xs text-[#9aa69f]">
            ยังไม่มีข้อมูลพนักงาน
          </p>
        )}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  icon,
  tone,
}: {
  label: string;
  value: number;
  suffix: string;
  icon: React.ReactNode;
  tone: "sage" | "blue" | "orange" | "purple";
}) {
  const tones = {
    sage: "bg-[#eef7f0] text-[#4d8a68]",
    blue: "bg-[#edf5fa] text-[#4d7d9a]",
    orange: "bg-[#fff3e9] text-[#bb6b37]",
    purple: "bg-[#f4eff9] text-[#8062a0]",
  };
  return (
    <div className="rounded-[22px] border border-[#e4e9e4] bg-white p-5 shadow-[0_12px_35px_rgba(43,64,54,0.04)]">
      <div
        className={`mb-7 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        {icon}
      </div>
      <p className="text-xs font-medium text-[#8c9a92]">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-3xl font-semibold text-[#29443d]">
          {value}
        </span>
        <span className="text-xs text-[#9aa69f]">{suffix}</span>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-[#6d7d79]">{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 rounded-2xl bg-[#f2f5f1] p-3 text-[#8da196]">
        {icon}
      </div>
      <p className="font-semibold text-[#53645c]">{title}</p>
      <p className="mt-1 text-xs text-[#9aa69f]">{detail}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 py-4">
      {[1, 2, 3].map(row => (
        <div key={row} className="h-12 animate-pulse rounded-xl bg-[#f3f5f2]" />
      ))}
    </div>
  );
}
