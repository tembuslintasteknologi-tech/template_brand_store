/**
 * Jam operasional live chat.
 *
 * Sumbernya dua: `settings['chat.hours']` sebagai default brand, dan
 * `store_locations.operating_hours` sebagai override per cabang. Cabang yang punya jadwal
 * sendiri menang; cabang yang belum diisi memakai default brand. Semua perhitungan waktu
 * memakai zona waktu yang ditulis di jadwal, bukan zona waktu server, karena server bisa
 * berjalan di UTC sementara cabang ada di Asia/Jakarta.
 */

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const WEEKDAY_ALIASES: Record<string, Weekday> = {
  sunday: 'sun',
  sun: 'sun',
  minggu: 'sun',
  monday: 'mon',
  mon: 'mon',
  senin: 'mon',
  tuesday: 'tue',
  tue: 'tue',
  tues: 'tue',
  selasa: 'tue',
  wednesday: 'wed',
  wed: 'wed',
  rabu: 'wed',
  thursday: 'thu',
  thu: 'thu',
  thur: 'thu',
  kamis: 'thu',
  friday: 'fri',
  fri: 'fri',
  jumat: 'fri',
  "jum'at": 'fri',
  saturday: 'sat',
  sat: 'sat',
  sabtu: 'sat',
};

export interface TimeRange {
  start: string;
  end: string;
}

export interface DaySchedule {
  closed: boolean;
  ranges: TimeRange[];
}

export interface ChatSchedule {
  timezone: string;
  alwaysOpen: boolean;
  days: Record<Weekday, DaySchedule>;
}

export class ChatHoursError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ChatHoursError';
  }
}

/** 08:00 sampai 21:00 Senin sampai Sabtu, 10:00 sampai 20:00 Minggu. */
export const DEFAULT_CHAT_SCHEDULE: ChatSchedule = {
  timezone: 'Asia/Jakarta',
  alwaysOpen: false,
  days: {
    sun: { closed: false, ranges: [{ start: '10:00', end: '20:00' }] },
    mon: { closed: false, ranges: [{ start: '08:00', end: '21:00' }] },
    tue: { closed: false, ranges: [{ start: '08:00', end: '21:00' }] },
    wed: { closed: false, ranges: [{ start: '08:00', end: '21:00' }] },
    thu: { closed: false, ranges: [{ start: '08:00', end: '21:00' }] },
    fri: { closed: false, ranges: [{ start: '08:00', end: '21:00' }] },
    sat: { closed: false, ranges: [{ start: '08:00', end: '21:00' }] },
  },
};

const CLOCK = /^(\d{1,2}):(\d{2})$/;

export function parseClockTime(value: unknown): number | null {
  const match = CLOCK.exec(String(value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatClockTime(minutes: number): string {
  const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function normalizeWeekday(key: string): Weekday | null {
  return WEEKDAY_ALIASES[String(key).trim().toLowerCase()] ?? null;
}

function emptyDays(): Record<Weekday, DaySchedule> {
  return WEEKDAYS.reduce((acc, day) => {
    acc[day] = { closed: true, ranges: [] };
    return acc;
  }, {} as Record<Weekday, DaySchedule>);
}

function normalizeRanges(input: unknown): TimeRange[] {
  const entries = Array.isArray(input) ? input : [input];
  const ranges: TimeRange[] = [];

  for (const entry of entries) {
    if (!entry) continue;

    // Sudah berbentuk `DaySchedule` hasil normalisasi sebelumnya. Ini membuat
    // `normalizeChatSchedule` idempoten, penting karena `resolveChatSchedule` menormalisasi
    // jadwal global yang outputnya juga bertipe `ChatSchedule`.
    if (typeof entry === 'object' && !Array.isArray(entry) && Array.isArray((entry as Record<string, unknown>).ranges)) {
      ranges.push(...normalizeRanges((entry as Record<string, unknown>).ranges));
      continue;
    }

    if (typeof entry === 'string') {
      const [start, end] = entry.split('-').map((part) => part.trim());
      const startMinutes = parseClockTime(start);
      const endMinutes = parseClockTime(end);
      if (startMinutes === null || endMinutes === null) {
        throw new ChatHoursError(`Rentang jam tidak valid: ${entry}. Format yang benar "08:00-21:00"`);
      }
      ranges.push({ start: formatClockTime(startMinutes), end: formatClockTime(endMinutes) });
      continue;
    }

    const record = entry as Record<string, unknown>;
    const startMinutes = parseClockTime(record.start ?? record.open ?? record.from);
    const endMinutes = parseClockTime(record.end ?? record.close ?? record.to);
    if (startMinutes === null || endMinutes === null) {
      throw new ChatHoursError('Setiap rentang jam wajib punya start dan end berformat HH:MM');
    }
    ranges.push({ start: formatClockTime(startMinutes), end: formatClockTime(endMinutes) });
  }

  return ranges;
}

/**
 * Menerima beberapa bentuk JSON yang wajar, karena `operating_hours` sudah dipakai modul lain
 * dengan bentuk `{ mon: { open, close } }` sementara API baru memakai `{ days: { mon: [...] } }`.
 */
export function normalizeChatSchedule(input: unknown, fallback: ChatSchedule = DEFAULT_CHAT_SCHEDULE): ChatSchedule {
  if (input === null || input === undefined) return cloneSchedule(fallback);
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ChatHoursError('Jadwal chat harus berupa objek JSON');
  }

  const record = input as Record<string, unknown>;
  const candidateDays =
    record.days && typeof record.days === 'object' && !Array.isArray(record.days)
      ? (record.days as Record<string, unknown>)
      : record;

  const timezone = typeof record.timezone === 'string' && record.timezone.trim() ? record.timezone.trim() : fallback.timezone;
  assertTimeZone(timezone);

  const alwaysOpen = record.alwaysOpen === true;
  const days = emptyDays();
  let configured = 0;

  for (const [key, value] of Object.entries(candidateDays)) {
    const day = normalizeWeekday(key);
    if (!day) continue;
    configured += 1;

    if (value === null || value === undefined || value === false) {
      days[day] = { closed: true, ranges: [] };
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).closed === true) {
      days[day] = { closed: true, ranges: [] };
      continue;
    }

    const ranges = normalizeRanges(value);
    days[day] = { closed: ranges.length === 0, ranges };
  }

  if (configured === 0) {
    // `{ alwaysOpen: true }` tanpa daftar hari tetap harus menang, kalau tidak cabang yang
    // ingin buka 24 jam akan diam-diam ikut jadwal global yang bisa saja tutup malam.
    const base = cloneSchedule(fallback);
    if (record.alwaysOpen !== undefined) base.alwaysOpen = alwaysOpen;
    return base;
  }

  return { timezone, alwaysOpen, days };
}

function cloneSchedule(schedule: ChatSchedule): ChatSchedule {
  return {
    timezone: schedule.timezone,
    alwaysOpen: schedule.alwaysOpen,
    days: WEEKDAYS.reduce((acc, day) => {
      acc[day] = { closed: schedule.days[day].closed, ranges: schedule.days[day].ranges.map((r) => ({ ...r })) };
      return acc;
    }, {} as Record<Weekday, DaySchedule>),
  };
}

export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new ChatHoursError(`Zona waktu tidak dikenal: ${timeZone}`);
  }
}

interface ZonedParts {
  weekday: Weekday;
  minutes: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const WEEKDAY_FROM_INDEX: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Bagian waktu pada zona tertentu, dihitung lewat `Intl` supaya DST ikut benar. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(lookup.weekday);
  const hour = Number(lookup.hour) % 24;
  const minute = Number(lookup.minute);
  const second = Number(lookup.second);

  return {
    weekday: WEEKDAY_FROM_INDEX[weekdayIndex === -1 ? 0 : weekdayIndex],
    minutes: hour * 60 + minute,
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour,
    minute,
    second,
  };
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

/** Mengubah jam dinding di zona tertentu menjadi instant UTC. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = zoneOffsetMs(new Date(guess), timeZone);
  let result = guess - firstOffset;
  const secondOffset = zoneOffsetMs(new Date(result), timeZone);
  if (secondOffset !== firstOffset) {
    result = guess - secondOffset;
  }
  return new Date(result);
}

function rangeStartEnd(range: TimeRange): { start: number; end: number } | null {
  const start = parseClockTime(range.start);
  const end = parseClockTime(range.end);
  if (start === null || end === null) return null;
  return { start, end };
}

/**
 * Rentang yang melewati tengah malam dipecah dua: bagian malam milik hari ini, bagian dini hari
 * milik hari berikutnya. Tanpa pemecahan ini, Senin 22:00-02:00 akan salah dianggap buka pada
 * Senin 01:00 padahal itu masih milik rentang Minggu yang mungkin tutup.
 */
export function isChatOpen(schedule: ChatSchedule, at: Date = new Date()): boolean {
  if (schedule.alwaysOpen) return true;
  const parts = zonedParts(at, schedule.timezone);

  const day = schedule.days[parts.weekday];
  if (day && !day.closed) {
    for (const range of day.ranges) {
      const span = rangeStartEnd(range);
      if (!span) continue;
      if (span.start === span.end) return true; // 24 jam
      if (span.end > span.start) {
        if (parts.minutes >= span.start && parts.minutes < span.end) return true;
      } else if (parts.minutes >= span.start) {
        return true;
      }
    }
  }

  // Sisa dari rentang lewat tengah malam milik hari sebelumnya.
  const previousWeekday = WEEKDAY_FROM_INDEX[(WEEKDAY_FROM_INDEX.indexOf(parts.weekday) + 6) % 7];
  const previous = schedule.days[previousWeekday];
  if (!previous || previous.closed) return false;

  for (const range of previous.ranges) {
    const span = rangeStartEnd(range);
    if (!span) continue;
    if (span.end < span.start && parts.minutes < span.end) return true;
  }

  return false;
}

/**
 * Instant berikutnya chat dibuka. `null` kalau dalam 14 hari ke depan tidak ada jadwal yang
 * cocok, yang berarti jadwalnya memang salah konfigurasi.
 */
export function nextOpenAt(schedule: ChatSchedule, from: Date = new Date()): Date | null {
  if (schedule.alwaysOpen) return from;

  const startParts = zonedParts(from, schedule.timezone);
  const currentMinutes = startParts.minutes;

  for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
    const probe = new Date(from.getTime() + dayOffset * 86_400_000);
    const parts = zonedParts(probe, schedule.timezone);
    const day = schedule.days[parts.weekday];
    if (!day || day.closed || day.ranges.length === 0) continue;

    const starts = day.ranges
      .map((range) => parseClockTime((range as TimeRange).start))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    for (const start of starts) {
      if (dayOffset === 0 && start <= currentMinutes) continue;
      return zonedTimeToUtc(parts.year, parts.month, parts.day, Math.floor(start / 60), start % 60, schedule.timezone);
    }
  }

  return null;
}

export interface ChatHoursState {
  open: boolean;
  timezone: string;
  nextOpenAt: string | null;
  today: { closed: boolean; ranges: TimeRange[] };
  alwaysOpen: boolean;
}

export function describeChatHours(schedule: ChatSchedule, at: Date = new Date()): ChatHoursState {
  const open = isChatOpen(schedule, at);
  const next = open ? null : nextOpenAt(schedule, at);
  const parts = zonedParts(at, schedule.timezone);
  const day = schedule.days[parts.weekday];

  return {
    open,
    timezone: schedule.timezone,
    nextOpenAt: next ? next.toISOString() : null,
    today: { closed: day?.closed ?? true, ranges: day?.ranges ?? [] },
    alwaysOpen: schedule.alwaysOpen,
  };
}

/**
 * Cabang tanpa jadwal memakai default brand. `null`/`{}` dari kolom jsonb dianggap belum diisi,
 * bukan berarti tutup permanen.
 */
export function resolveChatSchedule(branchOperatingHours: unknown, globalSchedule: unknown): ChatSchedule {
  const global = normalizeChatSchedule(globalSchedule, DEFAULT_CHAT_SCHEDULE);
  if (!branchOperatingHours || typeof branchOperatingHours !== 'object') return global;

  const record = branchOperatingHours as Record<string, unknown>;
  const hasDays = Object.keys(record).some((key) => normalizeWeekday(key) !== null);
  const hasNestedDays = record.days && typeof record.days === 'object';
  if (!hasDays && !hasNestedDays && record.alwaysOpen !== true) return global;

  return normalizeChatSchedule(branchOperatingHours, global);
}
