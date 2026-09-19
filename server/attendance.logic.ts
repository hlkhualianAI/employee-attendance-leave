export function getBangkokMinutes(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function calculateLateMinutes(timestamp: number, workStartMin: number) {
  return Math.max(0, getBangkokMinutes(timestamp) - workStartMin);
}

export function countWeekdays(startDate: string, endDate: string) {
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
