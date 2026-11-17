import test from 'node:test';
import assert from 'node:assert';
import {
  ChatHoursError,
  DEFAULT_CHAT_SCHEDULE,
  WEEKDAYS,
  assertTimeZone,
  describeChatHours,
  formatClockTime,
  isChatOpen,
  nextOpenAt,
  normalizeChatSchedule,
  parseClockTime,
  resolveChatSchedule,
  zonedParts,
  zonedTimeToUtc,
} from '../services/chat/chatHours.js';

// Semua instant di bawah adalah UTC. Jakarta tidak memakai DST, jadi selisihnya tetap +7.
const MON_0730 = new Date('2026-11-16T00:30:00Z');
const MON_1000 = new Date('2026-11-16T03:00:00Z');
const MON_2100 = new Date('2026-11-16T14:00:00Z');
const MON_2130 = new Date('2026-11-16T14:30:00Z');
const SUN_0900 = new Date('2026-11-15T02:00:00Z');
const SUN_1200 = new Date('2026-11-15T05:00:00Z');

function scheduleWith(ranges: Record<string, string[]>): ReturnType<typeof normalizeChatSchedule> {
  return normalizeChatSchedule({ timezone: 'Asia/Jakarta', days: ranges });
}

test('parseClockTime accepts HH:MM and H:MM, rejects everything else', () => {
  assert.strictEqual(parseClockTime('08:00'), 480);
  assert.strictEqual(parseClockTime('8:05'), 485);
  assert.strictEqual(parseClockTime(' 21:30 '), 1290);
  assert.strictEqual(parseClockTime('00:00'), 0);

  assert.strictEqual(parseClockTime('24:00'), null);
  assert.strictEqual(parseClockTime('08:60'), null);
  assert.strictEqual(parseClockTime('0800'), null);
  assert.strictEqual(parseClockTime(''), null);
  assert.strictEqual(parseClockTime(null), null);
  assert.strictEqual(parseClockTime('abc'), null);
});

test('formatClockTime pads and wraps around midnight', () => {
  assert.strictEqual(formatClockTime(0), '00:00');
  assert.strictEqual(formatClockTime(480), '08:00');
  assert.strictEqual(formatClockTime(1290), '21:30');
  assert.strictEqual(formatClockTime(1440), '00:00');
  assert.strictEqual(formatClockTime(-60), '23:00');
});

test('zonedParts and zonedTimeToUtc agree on Asia/Jakarta wall clock', () => {
  const parts = zonedParts(MON_1000, 'Asia/Jakarta');
  assert.strictEqual(parts.weekday, 'mon');
  assert.strictEqual(parts.hour, 10);
  assert.strictEqual(parts.minute, 0);
  assert.strictEqual(parts.minutes, 600);

  const backToUtc = zonedTimeToUtc(2026, 11, 16, 10, 0, 'Asia/Jakarta');
  assert.strictEqual(backToUtc.toISOString(), MON_1000.toISOString());
});

test('assertTimeZone rejects names Intl does not know', () => {
  assert.doesNotThrow(() => assertTimeZone('Asia/Jakarta'));
  assert.throws(() => assertTimeZone('Mars/Olympus'), ChatHoursError);
});

test('normalizeChatSchedule falls back when nothing usable is configured', () => {
  const fromNull = normalizeChatSchedule(null);
  assert.deepStrictEqual(fromNull, DEFAULT_CHAT_SCHEDULE);
  assert.notStrictEqual(fromNull, DEFAULT_CHAT_SCHEDULE, 'harus clone, bukan referensi yang sama');

  const fromEmpty = normalizeChatSchedule({});
  assert.deepStrictEqual(fromEmpty.days, DEFAULT_CHAT_SCHEDULE.days);

  // Hari yang tidak dikenal tidak dianggap konfigurasi, jadi default tetap dipakai.
  const fromUnknownKey = normalizeChatSchedule({ someday: ['08:00-09:00'] });
  assert.deepStrictEqual(fromUnknownKey, DEFAULT_CHAT_SCHEDULE);
});

test('normalizeChatSchedule rejects shapes that would silently close the chat', () => {
  assert.throws(() => normalizeChatSchedule('08:00-21:00'), ChatHoursError);
  assert.throws(() => normalizeChatSchedule(['08:00-21:00']), ChatHoursError);
  assert.throws(() => normalizeChatSchedule({ timezone: 'Bukan/Zona' }), ChatHoursError);
  assert.throws(() => normalizeChatSchedule({ days: { mon: ['08:00'] } }), ChatHoursError);
  assert.throws(() => normalizeChatSchedule({ days: { mon: [{ start: '08:00' }] } }), ChatHoursError);
});

test('normalizeChatSchedule accepts strings, range objects, and open/close aliases', () => {
  const fromStrings = scheduleWith({ mon: ['08:00-12:00', '13:00-17:00'] });
  assert.deepStrictEqual(fromStrings.days.mon, {
    closed: false,
    ranges: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
  });

  const fromObjects = normalizeChatSchedule({
    timezone: 'Asia/Jakarta',
    days: { selasa: [{ start: '9:00', end: '10:30' }] },
  });
  assert.deepStrictEqual(fromObjects.days.tue.ranges, [{ start: '09:00', end: '10:30' }]);

  const fromAliases = normalizeChatSchedule({
    timezone: 'Asia/Jakarta',
    days: { rabu: { open: '10:00', close: '15:00' } },
  });
  assert.deepStrictEqual(fromAliases.days.wed.ranges, [{ start: '10:00', end: '15:00' }]);
});

test('normalizeChatSchedule treats partial days as a full week replacement', () => {
  const schedule = scheduleWith({ mon: ['08:00-21:00'] });
  assert.strictEqual(schedule.days.mon.closed, false);
  for (const day of WEEKDAYS) {
    if (day === 'mon') continue;
    assert.deepStrictEqual(schedule.days[day], { closed: true, ranges: [] }, `${day} harus ikut tertutup`);
  }
});

test('normalizeChatSchedule honours explicit closed flags and alwaysOpen', () => {
  const closed = scheduleWith({ mon: [], tue: ['08:00-09:00'] });
  assert.deepStrictEqual(closed.days.mon, { closed: true, ranges: [] });

  const explicitlyClosed = normalizeChatSchedule({
    timezone: 'Asia/Jakarta',
    days: { mon: { closed: true }, tue: ['08:00-09:00'] },
  });
  assert.strictEqual(explicitlyClosed.days.mon.closed, true);

  const always = normalizeChatSchedule({ timezone: 'Asia/Jakarta', alwaysOpen: true, days: {} });
  assert.strictEqual(always.alwaysOpen, true);
  assert.strictEqual(isChatOpen(always, MON_2130), true);
});

test('isChatOpen follows the default schedule in Jakarta time, not server time', () => {
  // Senin 07:30 dan 21:30 Jakarta sudah di luar 08:00-21:00.
  assert.strictEqual(isChatOpen(DEFAULT_CHAT_SCHEDULE, MON_0730), false);
  assert.strictEqual(isChatOpen(DEFAULT_CHAT_SCHEDULE, MON_1000), true);
  assert.strictEqual(isChatOpen(DEFAULT_CHAT_SCHEDULE, MON_2100), false);
  assert.strictEqual(isChatOpen(DEFAULT_CHAT_SCHEDULE, MON_2130), false);

  // Minggu buka lebih siang: 09:00 tutup, 12:00 buka.
  assert.strictEqual(isChatOpen(DEFAULT_CHAT_SCHEDULE, SUN_0900), false);
  assert.strictEqual(isChatOpen(DEFAULT_CHAT_SCHEDULE, SUN_1200), true);
});

test('isChatOpen keeps overnight ranges alive after midnight', () => {
  // Hanya Senin 22:00-02:00, hari lain tutup.
  const overnight = scheduleWith({ mon: ['22:00-02:00'] });

  const monLate = new Date('2026-11-16T16:30:00Z'); // Senin 23:30 Jakarta
  const tueEarly = new Date('2026-11-16T18:00:00Z'); // Selasa 01:00 Jakarta
  const tueAfter = new Date('2026-11-16T19:00:00Z'); // Selasa 02:00 Jakarta
  const monEarly = new Date('2026-11-15T18:00:00Z'); // Senin 01:00 Jakarta, Minggu tutup

  assert.strictEqual(isChatOpen(overnight, monLate), true);
  assert.strictEqual(isChatOpen(overnight, tueEarly), true, 'dini hari Selasa masih milik rentang Senin');
  assert.strictEqual(isChatOpen(overnight, tueAfter), false);
  assert.strictEqual(isChatOpen(overnight, monEarly), false, 'Minggu tutup, jadi Senin 01:00 tidak diwarisi');
});

test('nextOpenAt returns the next opening instant in UTC', () => {
  const beforeOpening = nextOpenAt(DEFAULT_CHAT_SCHEDULE, MON_0730);
  assert.strictEqual(beforeOpening?.toISOString(), '2026-11-16T01:00:00.000Z');

  const afterClosing = nextOpenAt(DEFAULT_CHAT_SCHEDULE, MON_2130);
  assert.strictEqual(afterClosing?.toISOString(), '2026-11-17T01:00:00.000Z');

  // Minggu 21:00 tutup, buka lagi Senin 08:00.
  const fromSundayNight = nextOpenAt(DEFAULT_CHAT_SCHEDULE, new Date('2026-11-15T14:00:00Z'));
  assert.strictEqual(fromSundayNight?.toISOString(), '2026-11-16T01:00:00.000Z');
});

test('nextOpenAt returns the input instant when the chat is always open', () => {
  const always = normalizeChatSchedule({ timezone: 'Asia/Jakarta', alwaysOpen: true, days: {} });
  assert.strictEqual(nextOpenAt(always, MON_1000)?.toISOString(), MON_1000.toISOString());
});

test('nextOpenAt returns null when the schedule never opens', () => {
  const neverOpen = normalizeChatSchedule({ timezone: 'Asia/Jakarta', days: { mon: [] } });
  assert.strictEqual(nextOpenAt(neverOpen, MON_1000), null);
});

test('describeChatHours reports state, today ranges, and the next opening', () => {
  const closedState = describeChatHours(DEFAULT_CHAT_SCHEDULE, MON_0730);
  assert.strictEqual(closedState.open, false);
  assert.strictEqual(closedState.timezone, 'Asia/Jakarta');
  assert.strictEqual(closedState.nextOpenAt, '2026-11-16T01:00:00.000Z');
  assert.strictEqual(closedState.today.closed, false);
  assert.deepStrictEqual(closedState.today.ranges, [{ start: '08:00', end: '21:00' }]);
  assert.strictEqual(closedState.alwaysOpen, false);

  const openState = describeChatHours(DEFAULT_CHAT_SCHEDULE, MON_1000);
  assert.strictEqual(openState.open, true);
  assert.strictEqual(openState.nextOpenAt, null);
});

test('resolveChatSchedule prefers branch hours and ignores empty jsonb', () => {
  const global = normalizeChatSchedule({ timezone: 'Asia/Jakarta', days: { mon: ['08:00-21:00'] } });

  assert.deepStrictEqual(resolveChatSchedule(null, global), global);
  assert.deepStrictEqual(resolveChatSchedule({}, global), global);
  assert.deepStrictEqual(resolveChatSchedule({ catatan: 'kosong' }, global), global);

  const branch = resolveChatSchedule({ timezone: 'Asia/Jakarta', days: { mon: ['10:00-12:00'] } }, global);
  assert.deepStrictEqual(branch.days.mon.ranges, [{ start: '10:00', end: '12:00' }]);
  assert.strictEqual(branch.days.tue.closed, true, 'override cabang mengganti seluruh minggu');

  const flat = resolveChatSchedule({ senin: ['09:00-10:00'] }, global);
  assert.deepStrictEqual(flat.days.mon.ranges, [{ start: '09:00', end: '10:00' }]);
});

test('resolveChatSchedule lets a branch open 24 hours without listing every day', () => {
  const global = normalizeChatSchedule({ timezone: 'Asia/Jakarta', days: { mon: ['08:00-21:00'] } });
  const branch = resolveChatSchedule({ alwaysOpen: true }, global);

  assert.strictEqual(branch.alwaysOpen, true);
  assert.strictEqual(isChatOpen(branch, MON_2130), true);
});
