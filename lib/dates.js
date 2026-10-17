// Calendar helpers. Days are local "YYYY-MM-DD" strings.

export function toDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function fromDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}

export function today() {
  return toDay(new Date());
}

export function addDays(day, count) {
  const date = fromDay(day);
  date.setDate(date.getDate() + count);
  return toDay(date);
}

export function monthStart(day) {
  const date = fromDay(day);
  return toDay(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

export function addMonths(day, count) {
  const date = fromDay(day);
  const dayOfMonth = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + count, 1, 12);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
    12,
  ).getDate();
  target.setDate(Math.min(dayOfMonth, lastDay));
  return toDay(target);
}

// Six weeks of days covering the month, starting on a Sunday.
export function monthGrid(month) {
  const first = monthStart(month);
  const offset = fromDay(first).getDay();
  return Array.from({ length: 42 }, (_, index) =>
    addDays(first, index - offset),
  );
}

export function formatDay(day) {
  return day
    ? fromDay(day).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
}

// Picks the next [start, end] when a day is clicked in a range calendar.
export function nextRange(start, end, day) {
  return !start || end || day < start ? [day, undefined] : [start, day];
}
