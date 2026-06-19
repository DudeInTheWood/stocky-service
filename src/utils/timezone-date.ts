export function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export function getDateOnlyInTimezone(date: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Failed to calculate local date for timezone "${timezone}".`);
  }

  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

export function getUtcRangeForDateInTimezone(
  date: Date,
  timezone: string
): { start: Date; end: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const nextDate = addDays(date, 1);

  return {
    start: zonedTimeToUtc(year, month, day, timezone),
    end: zonedTimeToUtc(
      nextDate.getUTCFullYear(),
      nextDate.getUTCMonth() + 1,
      nextDate.getUTCDate(),
      timezone
    )
  };
}

function zonedTimeToUtc(year: number, month: number, day: number, timezone: string): Date {
  const targetTime = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let utcDate = new Date(targetTime);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const localParts = getDateTimePartsInTimezone(utcDate, timezone);
    const localTime = Date.UTC(
      localParts.year,
      localParts.month - 1,
      localParts.day,
      localParts.hour,
      localParts.minute,
      localParts.second,
      0
    );

    const diff = localTime - targetTime;
    utcDate = new Date(utcDate.getTime() - diff);
  }

  return utcDate;
}

function getDateTimePartsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
    hour: Number(parts.find((part) => part.type === "hour")?.value),
    minute: Number(parts.find((part) => part.type === "minute")?.value),
    second: Number(parts.find((part) => part.type === "second")?.value)
  };
}
