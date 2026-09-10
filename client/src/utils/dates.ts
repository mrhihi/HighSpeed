const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Formats a Date as yyyy-MM-dd in local time. */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayString(): string {
  return toDateString(new Date());
}

/** Validates a 24-hour clock value in HH:mm format. */
export function isTimeString(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Expands an inclusive date range (yyyy-MM-dd strings) into every day within it. */
export function expandDateRange(startStr: string, endStr: string): string[] {
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toDateString(cursor));
    cursor.setTime(cursor.getTime() + MS_PER_DAY);
  }
  return dates;
}
