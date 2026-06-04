const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getDateTimeInZone(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date(ms));

  const get = (type) => parts.find((p) => p.type === type)?.value;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    dayOfWeek: WEEKDAY_MAP[get('weekday')],
  };
}

function zonedTimeToUtc({ year, month, day, hour, minute = 0, second = 0 }, timeZone) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 3; i++) {
    const z = getDateTimeInZone(utc, timeZone);
    const zAsUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    utc += targetAsUtc - zAsUtc;
  }

  return utc;
}

function addDays({ year, month, day }, days) {
  const d = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Returns the earliest UTC timestamp >= baseDateMs that falls within the
 * campaign schedule window (timezone, days of week, start/end hours).
 */
export function getNextValidTime(baseDateMs, schedule) {
  const {
    startHour = 9,
    endHour = 17,
    daysOfWeek = [1, 2, 3, 4, 5],
    startDate,
    timezone = 'UTC',
  } = schedule || {};

  let targetMs = baseDateMs;

  if (startDate) {
    const startMs = new Date(startDate).getTime();
    if (targetMs < startMs) targetMs = startMs;
  }

  let iterations = 0;
  while (iterations < 366) {
    const z = getDateTimeInZone(targetMs, timezone);

    if (!daysOfWeek.includes(z.dayOfWeek)) {
      const next = addDays(z, 1);
      targetMs = zonedTimeToUtc({ ...next, hour: startHour, minute: 0, second: 0 }, timezone);
      iterations++;
      continue;
    }

    if (z.hour < startHour) {
      return zonedTimeToUtc({ year: z.year, month: z.month, day: z.day, hour: startHour, minute: 0, second: 0 }, timezone);
    }

    if (z.hour >= endHour) {
      const next = addDays(z, 1);
      targetMs = zonedTimeToUtc({ ...next, hour: startHour, minute: 0, second: 0 }, timezone);
      iterations++;
      continue;
    }

    return targetMs;
  }

  return targetMs;
}
