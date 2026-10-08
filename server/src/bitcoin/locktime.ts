// Absolute locktimes (BIP 65 CLTV). Values below 500,000,000 are block heights;
// at or above it they are Unix timestamps in seconds. We only use timestamps.
export const LOCKTIME_THRESHOLD = 500_000_000;
// nLockTime is a uint32, so the latest expressible time is 2106-02-07.
export const MAX_LOCKTIME = 0xffff_ffff;

export class LocktimeError extends Error {
  override name = "LocktimeError";
}

/** Converts a Date to a timestamp locktime, rounding down to whole seconds. */
export function dateToLocktime(date: Date): number {
  const ms = date.getTime();
  if (Number.isNaN(ms)) throw new LocktimeError("Invalid date");
  const locktime = Math.floor(ms / 1000);
  if (locktime < LOCKTIME_THRESHOLD) {
    throw new LocktimeError("Date is too early to be a timestamp locktime (before 1985-11-05)");
  }
  if (locktime > MAX_LOCKTIME) throw new LocktimeError("Date is past the last valid locktime (2106-02-07)");
  return locktime;
}

export function locktimeToDate(locktime: number): Date {
  if (!Number.isInteger(locktime) || locktime < LOCKTIME_THRESHOLD || locktime > MAX_LOCKTIME) {
    throw new LocktimeError(`Not a timestamp locktime: ${locktime}`);
  }
  return new Date(locktime * 1000);
}

/**
 * Timestamp locktimes are checked against the median time past (BIP 113) of the
 * last 11 blocks, which usually trails wall-clock time by about an hour.
 * A spend becomes valid in the block after this returns true.
 */
export function isLocktimeReached(locktime: number, medianTimePast: number): boolean {
  return medianTimePast >= locktime;
}

/** Validates a requested unlock date for a new bottle. */
export function validateUnlockDate(date: Date, now: Date = new Date()): number {
  const locktime = dateToLocktime(date);
  if (locktime <= Math.floor(now.getTime() / 1000)) {
    throw new LocktimeError("Unlock date must be in the future");
  }
  return locktime;
}
