import { describe, expect, it } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { wallTimeToEpochMs } from '../src/time/policy.js';

function buildZdt(localText: string, disambiguation: 'earlier' | 'later') {
  const local = Temporal.PlainDateTime.from(localText);
  return Temporal.ZonedDateTime.from(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      minute: local.minute,
      second: local.second,
      millisecond: local.millisecond,
      microsecond: local.microsecond,
      nanosecond: local.nanosecond,
      timeZone: 'America/New_York',
    },
    { disambiguation }
  );
}

describe('DST 边界策略', () => {
  it('nonexistent 时间必须 reject（America/New_York 春季跳时）', () => {
    expect(() => wallTimeToEpochMs('2026-03-08T02:30:00', 'America/New_York')).toThrow(
      /nonexistent wall time rejected/
    );
  });

  it('ambiguous 时间固定选 EARLIER（America/New_York 秋季回拨）', () => {
    const earlier = buildZdt('2026-11-01T01:30:00', 'earlier');
    const later = buildZdt('2026-11-01T01:30:00', 'later');

    const chosen = wallTimeToEpochMs('2026-11-01T01:30:00', 'America/New_York');

    expect(chosen).toBe(BigInt(earlier.epochMilliseconds));
    expect(BigInt(later.epochMilliseconds - earlier.epochMilliseconds)).toBe(3600000n);
  });
});
