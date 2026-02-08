import { Temporal } from '@js-temporal/polyfill';
import { assertTimeRuntimeReady, wallTimeToEpochMs } from './policy.js';

function main(): void {
  assertTimeRuntimeReady();

  const sample = Temporal.ZonedDateTime.from({
    year: 2026,
    month: 2,
    day: 8,
    hour: 12,
    minute: 0,
    second: 0,
    timeZone: 'Asia/Shanghai',
  });

  if (!Number.isFinite(sample.epochMilliseconds)) {
    throw new Error('Temporal conversion returned non-finite epochMilliseconds');
  }

  const ms = wallTimeToEpochMs('2026-11-01T01:30:00', 'America/New_York');
  if (ms <= 0n) {
    throw new Error('wallTimeToEpochMs runtime self-check failed');
  }

  console.log('[runtime-check] OK: Temporal + IANA 时区数据可用');
}

main();
