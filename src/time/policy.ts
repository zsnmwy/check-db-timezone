import { Temporal } from '@js-temporal/polyfill';

export const EPOCH_MS_MIN = 946684800000n;
export const EPOCH_MS_MAX = 4102444800000n;

const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const REQUIRED_TZS = new Set(['Asia/Shanghai', 'America/New_York']);
const ALL_TZS =
  typeof Intl.supportedValuesOf === 'function'
    ? new Set(Intl.supportedValuesOf('timeZone'))
    : null;

function toZonedDateTime(
  local: Temporal.PlainDateTime,
  tz: string,
  disambiguation: 'earlier' | 'later'
): Temporal.ZonedDateTime {
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
      timeZone: tz,
    },
    { disambiguation }
  );
}

export function nowEpochMs(): bigint {
  return BigInt(Date.now());
}

export function assertEpochMsRange(ms: bigint): void {
  if (ms < EPOCH_MS_MIN || ms > EPOCH_MS_MAX) {
    throw new Error(`epoch_ms out of range: ${ms.toString()}`);
  }
}

export function toApiEpochMs(ms: bigint): string {
  assertEpochMsRange(ms);
  return ms.toString();
}

export function parseApiEpochMs(raw: string): bigint {
  if (!/^\d{10,16}$/.test(raw)) {
    throw new Error(`invalid epoch_ms format: ${raw}`);
  }

  const ms = BigInt(raw);
  assertEpochMsRange(ms);
  return ms;
}

export function assertWallTimeLocalFormat(local: string): void {
  if (!LOCAL_DATETIME_RE.test(local)) {
    throw new Error(`invalid local datetime format: ${local}`);
  }

  try {
    Temporal.PlainDateTime.from(local);
  } catch (error) {
    throw new Error(`invalid local datetime value: ${String(error)}`);
  }
}

export function assertIanaTimeZone(tz: string): void {
  if (!ALL_TZS) {
    throw new Error('Intl.supportedValuesOf(timeZone) is unavailable');
  }

  if (!ALL_TZS.has(tz)) {
    throw new Error(`invalid IANA time zone: ${tz}`);
  }
}

export function wallTimeToEpochMs(local: string, tz: string): bigint {
  assertWallTimeLocalFormat(local);
  assertIanaTimeZone(tz);

  const pdt = Temporal.PlainDateTime.from(local);
  const earlier = toZonedDateTime(pdt, tz, 'earlier');

  // spring-forward gap should be rejected instead of silently shifted.
  const roundTrip = earlier.toPlainDateTime().toString({ smallestUnit: 'second' });
  if (roundTrip !== local) {
    throw new Error(`nonexistent wall time rejected: ${local} @ ${tz}`);
  }

  // fall-back duplicated hour: fixed policy = EARLIER.
  const ms = BigInt(earlier.epochMilliseconds);
  assertEpochMsRange(ms);
  return ms;
}

export function assertTimeRuntimeReady(): void {
  if (!ALL_TZS) {
    throw new Error('Intl.supportedValuesOf(timeZone) is unavailable');
  }

  for (const tz of REQUIRED_TZS) {
    if (!ALL_TZS.has(tz)) {
      throw new Error(`required time zone not supported: ${tz}`);
    }
  }
}
