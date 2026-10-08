import { describe, expect, it } from "vitest";
import {
  LOCKTIME_THRESHOLD,
  LocktimeError,
  MAX_LOCKTIME,
  dateToLocktime,
  isLocktimeReached,
  locktimeToDate,
  validateUnlockDate,
} from "../src/bitcoin/locktime.js";

describe("locktime/date conversion", () => {
  it("converts a UTC date to unix seconds and back", () => {
    const date = new Date("2030-06-18T12:00:00Z");
    expect(dateToLocktime(date)).toBe(1_908_014_400);
    expect(locktimeToDate(1_908_014_400).toISOString()).toBe("2030-06-18T12:00:00.000Z");
  });

  it("rounds sub-second dates down, never up past the chosen time", () => {
    expect(dateToLocktime(new Date("2030-06-18T12:00:00.999Z"))).toBe(1_908_014_400);
  });

  it("enforces the timestamp range", () => {
    expect(() => dateToLocktime(new Date((LOCKTIME_THRESHOLD - 1) * 1000))).toThrow(LocktimeError);
    expect(dateToLocktime(new Date(LOCKTIME_THRESHOLD * 1000))).toBe(LOCKTIME_THRESHOLD);
    expect(dateToLocktime(new Date(MAX_LOCKTIME * 1000))).toBe(MAX_LOCKTIME);
    expect(() => dateToLocktime(new Date((MAX_LOCKTIME + 1) * 1000))).toThrow(LocktimeError);
    expect(() => dateToLocktime(new Date("nope"))).toThrow(LocktimeError);
    expect(() => locktimeToDate(800_000)).toThrow(LocktimeError); // a block height
    expect(() => locktimeToDate(1.5e9 + 0.5)).toThrow(LocktimeError);
  });

  it("compares against median time past inclusively", () => {
    expect(isLocktimeReached(1_908_014_400, 1_908_014_399)).toBe(false);
    expect(isLocktimeReached(1_908_014_400, 1_908_014_400)).toBe(true);
  });

  it("requires unlock dates in the future", () => {
    const now = new Date("2026-10-08T00:00:00Z");
    expect(() => validateUnlockDate(now, now)).toThrow(/future/);
    expect(validateUnlockDate(new Date("2026-10-09T00:00:00Z"), now)).toBe(1_791_504_000);
  });
});
