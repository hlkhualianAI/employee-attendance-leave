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
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

const leaveTypeLabels = {
  annual: "ลาพักร้อน",
  sick: "ลาป่วย",
  personal: "ลากิจ",
  other: "ลาอื่น ๆ",
} as const;

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
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

function displayTime(timestamp: number | null | undefined) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function getMonthKey(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(date);
  return formatted.replace("/", "-");
}

function countWeekdays(startDate: string, endDate: string) {
  const parseDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 86400000) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

function statusLabel(status: string) {
  if (status === "approved") return { text: "อนุมัติแล้ว", className: "bg-emerald-50 text-emerald-700" };
  if (status === "rejected") return { text: "ไม่อนุมัติ", className: "bg-rose-50 text-rose-700" };
  return { text: "รอตรวจสอบ", className: "bg-amber-50 text-amber-700" };
}

export default function Home() {
  const { user } = useAuth();
  const today = useMemo(() => bangkokDate(), []);
  const month = useMemo(() => getMonthKey(), []);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "">("");
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({ employeeCode: "", fullName: "", department: "", position: "" });
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", leaveType: "annual", startDate: today, endDate: today, reason: "" });

  const utils = trpc.useUtils();
  const employeesQuery = trpc.employees.list.useQuery();
  const summaryQuery = trpc.attendance.summary.useQuery({ month });
  const todayQuery = trpc.attendance.byDate.useQuery({ workDate: today });
  const recentQuery = trpc.attendance.recent.useQuery();
  const leaveQuery = trpc.leave.list.useQuery();

  const createEmployeeMutation = trpc.employees.create.useMutation({
    onSuccess: () => {
      toast.success("เพิ่มข้อมูลพนักงานแล้ว");
      setEmployeeForm({ employeeCode: "", fullName: "", department: "", position: "" });
      setShowEmployeeForm(false);
      void utils.employees.list.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: (error) => toast.error(error.message || "เพิ่มพนักงานไม่สำเร็จ"),
  });

  const checkInMutation = trpc.attendance.checkIn.useMutation({
    onSuccess: (result) => {
      toast.success(result.lateMinutes > 0 ? `เช็คอินแล้ว · มาสาย ${result.lateMinutes} นาที` : "เช็คอินสำเร็จ · ตรงเวลา");
      void utils.attendance.byDate.invalidate();
      void utils.attendance.recent.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: (error) => toast.error(error.message || "เช็คอินไม่สำเร็จ"),
  });

  const checkOutMutation = trpc.attendance.checkOut.useMutation({
    onSuccess: () => {
      toast.success("บันทึกเวลาเช็คเอาต์แล้ว");
      void utils.attendance.byDate.invalidate();
      void utils.attendance.recent.invalidate();
    },
    onError: (error) => toast.error(error.message || "เช็คเอาต์ไม่สำเร็จ"),
  });

  const createLeaveMutation = trpc.leave.create.useMutation({
    onSuccess: () => {
      toast.success("ส่งคำขอลาแล้ว");
      setShowLeaveForm(false);
      setLeaveForm({ employeeId: "", leaveType: "annual", startDate: today, endDate: today, reason: "" });
      void utils.leave.list.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: (error) => toast.error(error.message || "ส่งคำขอลาไม่สำเร็จ"),
  });

  const updateLeaveMutation = trpc.leave.updateStatus.useMutation({
    onSuccess: (_, variables) => {
      toast.success(variables.status === "approved" ? "อนุมัติวันลาแล้ว" : "เปลี่ยนสถานะคำขอแล้ว");
      void utils.leave.list.invalidate();
      void utils.attendance.summary.invalidate();
    },
    onError: (error) => toast.error(error.message || "เปลี่ยนสถานะไม่สำเร็จ"),
  });

  const employees = employeesQuery.data ?? [];
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const todayAttendance = (todayQuery.data ?? []).find((item) => item.employeeId === selectedEmployeeId);
  const summary = summaryQuery.data ?? { totalEmployees: 0, presentDays: 0, lateDays: 0, approvedLeaveDays: 0, pendingLeaves: 0 };
  const isBusy = checkInMutation.isPending || checkOutMutation.isPending;
  const currentMonthLabel = monthNames[Number(month.split("-")[1]) - 1] ?? "เดือนนี้";

  function submitEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createEmployeeMutation.mutate(employeeForm);
  }

  function submitLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const totalDays = countWeekdays(leaveForm.startDate, leaveForm.endDate);
    if (!leaveForm.employeeId || totalDays < 1) {
      toast.error("กรุณาเลือกพนักงานและช่วงวันที่ถูกต้อง");
      return;
    }
    createLeaveMutation.mutate({
      employeeId: Number(leaveForm.employeeId),
      leaveType: leaveForm.leaveType as "annual" | "sick" | "personal" | "other",
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      totalDays,
      reason: leaveForm.reason || undefined,
    });
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
            <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1d3330] md:text-4xl">
              สวัสดี, {user?.name?.split(" ")[0] || "ผู้ดูแลระบบ"}
            </h1>
            <p className="mt-2 text-sm text-[#6d7d79]">ภาพรวมเวลาทำงานและคำขอลาของทีมในที่เดียว</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#6d7d79]">
            <div className="rounded-2xl border border-[#dfe5df] bg-white px-4 py-2.5 shadow-[0_8px_25px_rgba(43,64,54,0.04)]">
              <span className="mr-2 text-[#9aa9a3]">วันนี้</span>
              <span className="font-semibold text-[#29443d]">{displayDate(today)}</span>
            </div>
            <Button variant="outline" size="icon" className="border-[#dfe5df] bg-white text-[#5d756d]" onClick={() => { void utils.attendance.summary.invalidate(); void utils.attendance.recent.invalidate(); void utils.leave.list.invalidate(); }} aria-label="รีเฟรชข้อมูล">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="relative overflow-hidden rounded-[28px] bg-[#173b38] p-7 text-white shadow-[0_18px_45px_rgba(24,59,56,0.16)] md:p-9">
            <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border-[30px] border-white/5" />
            <div className="absolute bottom-[-110px] right-24 h-56 w-56 rounded-full border-[26px] border-[#d57945]/15" />
            <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-end">
              <div className="max-w-xl">
                <div className="mb-5 flex items-center gap-3 text-sm font-medium text-[#b7d7ca]"><Clock3 className="h-4 w-4" /> การลงเวลาประจำวัน</div>
                <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">ทำให้ทุกนาที<br /><span className="text-[#e5ad7e]">ชัดเจนและตรวจสอบได้</span></h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-[#b4c9c0]">เลือกพนักงานเพื่อบันทึกเวลาเข้าออก ระบบจะคำนวณเวลามาสายจากเวลาเริ่มงานของแต่ละคนโดยอัตโนมัติ</p>
              </div>
              <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <Label className="text-xs font-medium text-[#c5d9d0]">พนักงานที่จะลงเวลา</Label>
                <select className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#244d49] px-3 text-sm text-white outline-none ring-offset-2 focus:ring-2 focus:ring-[#e5ad7e]" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value ? Number(event.target.value) : "")}>
                  <option value="">เลือกพนักงาน</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} · {employee.employeeCode}</option>)}
                </select>
                <div className="mt-3 flex gap-2">
                  <Button className="flex-1 bg-[#e5ad7e] text-[#273c37] hover:bg-[#f0bd93]" disabled={!selectedEmployee || isBusy} onClick={() => checkInMutation.mutate({ employeeId: selectedEmployee!.id, workDate: today, timestamp: Date.now() })}>
                    <LogIn className="mr-2 h-4 w-4" /> เช็คอิน
                  </Button>
                  <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" disabled={!todayAttendance?.checkInAt || isBusy} onClick={() => checkOutMutation.mutate({ employeeId: selectedEmployee!.id, workDate: today, timestamp: Date.now() })}>
                    <LogOut className="mr-2 h-4 w-4" /> เช็คเอาต์
                  </Button>
                </div>
                {selectedEmployee && <p className="mt-3 text-xs text-[#b4c9c0]">เวลาเริ่มงาน {String(Math.floor(selectedEmployee.workStartMin / 60)).padStart(2, "0")}:{String(selectedEmployee.workStartMin % 60).padStart(2, "0")} น. {todayAttendance?.checkInAt ? `· เข้าแล้ว ${displayTime(todayAttendance.checkInAt)}` : "· ยังไม่มีรายการวันนี้"}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="พนักงานที่ใช้งาน" value={summary.totalEmployees} suffix="คน" icon={<Users className="h-5 w-5" />} tone="sage" />
            <MetricCard label="วันมาทำงาน" value={summary.presentDays} suffix="รายการ" icon={<CheckCircle2 className="h-5 w-5" />} tone="blue" />
            <MetricCard label="มาสาย" value={summary.lateDays} suffix="รายการ" icon={<AlarmClock className="h-5 w-5" />} tone="orange" />
            <MetricCard label="วันลาที่อนุมัติ" value={summary.approvedLeaveDays} suffix="วัน" icon={<CalendarDays className="h-5 w-5" />} tone="purple" />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[24px] border border-[#e4e9e4] bg-white p-6 shadow-[0_12px_35px_rgba(43,64,54,0.045)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#91a19a]">ล่าสุด</p><h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">การลงเวลาเข้าออก</h2></div>
              <div className="rounded-full bg-[#f3f6f1] px-3 py-1.5 text-xs font-medium text-[#6d7d79]">{currentMonthLabel} {month.split("-")[0]}</div>
            </div>
            {recentQuery.isLoading ? <LoadingRows /> : recentQuery.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b border-[#edf0ed] text-xs font-medium text-[#99a69f]"><th className="pb-3 font-medium">พนักงาน</th><th className="pb-3 font-medium">วันที่</th><th className="pb-3 font-medium">เข้า</th><th className="pb-3 font-medium">ออก</th><th className="pb-3 text-right font-medium">สถานะ</th></tr></thead><tbody>{recentQuery.data.map((record) => <tr key={record.id} className="border-b border-[#f1f3f0] last:border-0"><td className="py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf3ed] text-xs font-bold text-[#5d786d]">{record.fullName.slice(0, 1)}</div><div><p className="font-semibold text-[#314943]">{record.fullName}</p><p className="text-xs text-[#9aa8a1]">{record.employeeCode} · {record.department}</p></div></div></td><td className="py-4 text-[#6d7d79]">{displayDate(record.workDate)}</td><td className="py-4 font-medium text-[#314943]">{displayTime(record.checkInAt)}</td><td className="py-4 text-[#6d7d79]">{displayTime(record.checkOutAt)}</td><td className="py-4 text-right">{record.lateMinutes > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3e9] px-2.5 py-1 text-xs font-semibold text-[#b85f2d]"><AlarmClock className="h-3.5 w-3.5" /> สาย {record.lateMinutes} นาที</span> : <span className="inline-flex items-center gap-1 rounded-full bg-[#edf8f0] px-2.5 py-1 text-xs font-semibold text-[#348354]"><Check className="h-3.5 w-3.5" /> ตรงเวลา</span>}</td></tr>)}</tbody></table></div> : <EmptyState icon={<Clock3 />} title="ยังไม่มีรายการลงเวลา" detail="เพิ่มพนักงานและเริ่มเช็คอินเพื่อดูข้อมูลที่นี่" />}
          </div>

          <div className="rounded-[24px] border border-[#e4e9e4] bg-[#fffdf9] p-6 shadow-[0_12px_35px_rgba(43,64,54,0.045)]">
            <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b5a18f]">ต้องติดตาม</p><h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">คำขอลา</h2></div><span className="rounded-full bg-[#fff1df] px-3 py-1.5 text-xs font-semibold text-[#b66c35]">{summary.pendingLeaves} รอตรวจสอบ</span></div>
            <div className="space-y-3">{leaveQuery.isLoading ? <LoadingRows /> : leaveQuery.data?.length ? leaveQuery.data.slice(0, 5).map((request) => { const status = statusLabel(request.status); return <div key={request.id} className="rounded-2xl border border-[#f0ebe3] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#354a43]">{request.fullName}</p><p className="mt-0.5 text-xs text-[#9b9d94]">{leaveTypeLabels[request.leaveType]} · {request.totalDays} วัน</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.text}</span></div><p className="mt-3 text-xs text-[#7c8981]">{displayDate(request.startDate)} — {displayDate(request.endDate)}</p>{request.status === "pending" && <div className="mt-3 flex gap-2"><Button size="sm" className="h-8 flex-1 bg-[#2f7564] text-xs hover:bg-[#276355]" onClick={() => updateLeaveMutation.mutate({ id: request.id, status: "approved" })}><Check className="mr-1.5 h-3.5 w-3.5" /> อนุมัติ</Button><Button size="sm" variant="outline" className="h-8 border-[#efd9d5] text-xs text-[#bd6b63] hover:bg-[#fff4f2] hover:text-[#a8564e]" onClick={() => updateLeaveMutation.mutate({ id: request.id, status: "rejected" })}><X className="mr-1.5 h-3.5 w-3.5" /> ไม่อนุมัติ</Button></div>}</div> }) : <EmptyState icon={<CalendarDays />} title="ยังไม่มีคำขอลา" detail="คำขอใหม่จะแสดงในส่วนนี้" />}</div>
            <Button variant="ghost" className="mt-4 w-full justify-between text-[#4d7166] hover:bg-[#f5f8f4] hover:text-[#2f5b50]" onClick={() => setShowLeaveForm((value) => !value)}>{showLeaveForm ? "ปิดแบบฟอร์ม" : "สร้างคำขอลา"}<ArrowRight className="h-4 w-4" /></Button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-[24px] border border-dashed border-[#cbd9d0] bg-[#f3f8f3] p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#789288]">ทีมของคุณ</p><h2 className="mt-1 font-display text-xl font-semibold text-[#29443d]">จัดการพนักงาน</h2></div><div className="rounded-xl bg-white p-2 text-[#5d8b78]"><Users className="h-5 w-5" /></div></div><p className="mt-3 text-sm leading-6 text-[#6d8179]">เพิ่มรายชื่อพนักงานและกำหนดเวลาเริ่มงาน เพื่อให้ระบบคำนวณการมาสายได้ตรงตามจริง</p><Button className="mt-5 bg-[#2f7564] hover:bg-[#276355]" onClick={() => setShowEmployeeForm((value) => !value)}><Plus className="mr-2 h-4 w-4" />{showEmployeeForm ? "ปิดแบบฟอร์ม" : "เพิ่มพนักงาน"}</Button>{showEmployeeForm && <form onSubmit={submitEmployee} className="mt-5 space-y-3 border-t border-[#dce8de] pt-5"><FormField label="รหัสพนักงาน"><Input required value={employeeForm.employeeCode} onChange={(event) => setEmployeeForm({ ...employeeForm, employeeCode: event.target.value })} placeholder="เช่น EMP-001" /></FormField><FormField label="ชื่อ-นามสกุล"><Input required value={employeeForm.fullName} onChange={(event) => setEmployeeForm({ ...employeeForm, fullName: event.target.value })} placeholder="ชื่อพนักงาน" /></FormField><div className="grid gap-3 sm:grid-cols-2"><FormField label="แผนก"><Input required value={employeeForm.department} onChange={(event) => setEmployeeForm({ ...employeeForm, department: event.target.value })} placeholder="เช่น ฝ่ายขาย" /></FormField><FormField label="ตำแหน่ง"><Input required value={employeeForm.position} onChange={(event) => setEmployeeForm({ ...employeeForm, position: event.target.value })} placeholder="เช่น Sales Executive" /></FormField></div><Button type="submit" disabled={createEmployeeMutation.isPending} className="w-full bg-[#2f7564] hover:bg-[#276355]">บันทึกข้อมูลพนักงาน</Button></form>}</div>

        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, suffix, icon, tone }: { label: string; value: number; suffix: string; icon: React.ReactNode; tone: "sage" | "blue" | "orange" | "purple" }) {
  const tones = { sage: "bg-[#eef7f0] text-[#4d8a68]", blue: "bg-[#edf5fa] text-[#4d7d9a]", orange: "bg-[#fff3e9] text-[#bb6b37]", purple: "bg-[#f4eff9] text-[#8062a0]" };
  return <div className="rounded-[22px] border border-[#e4e9e4] bg-white p-5 shadow-[0_12px_35px_rgba(43,64,54,0.04)]"><div className={`mb-7 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><p className="text-xs font-medium text-[#8c9a92]">{label}</p><div className="mt-1 flex items-baseline gap-1"><span className="font-display text-3xl font-semibold text-[#29443d]">{value}</span><span className="text-xs text-[#9aa69f]">{suffix}</span></div></div>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-medium text-[#6d7d79]">{label}</Label>{children}</div>;
}

function EmptyState({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="flex flex-col items-center justify-center py-12 text-center"><div className="mb-3 rounded-2xl bg-[#f2f5f1] p-3 text-[#8da196]">{icon}</div><p className="font-semibold text-[#53645c]">{title}</p><p className="mt-1 text-xs text-[#9aa69f]">{detail}</p></div>;
}

function LoadingRows() {
  return <div className="space-y-3 py-4">{[1, 2, 3].map((row) => <div key={row} className="h-12 animate-pulse rounded-xl bg-[#f3f5f2]" />)}</div>;
}
