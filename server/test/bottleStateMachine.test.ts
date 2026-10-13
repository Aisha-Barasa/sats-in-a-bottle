import { describe, expect, it, vi } from "vitest";
import {
  BOTTLE_STATUSES,
  InvalidTransitionError,
  assertTransition,
  canTransition,
  transitionBottle,
} from "../src/domain/bottleStateMachine.js";

describe("bottle state machine", () => {
  it("allows the happy path in order", () => {
    for (let i = 0; i < BOTTLE_STATUSES.length - 1; i++) {
      expect(canTransition(BOTTLE_STATUSES[i]!, BOTTLE_STATUSES[i + 1]!)).toBe(true);
    }
  });

  it("rejects skips, reversals and unknown states", () => {
    expect(canTransition("draft", "funded")).toBe(false);
    expect(canTransition("awaiting_funding", "sealed")).toBe(false);
    expect(canTransition("sealed", "funded")).toBe(false);
    expect(canTransition("sealed", "claimed")).toBe(false);
    expect(canTransition("claimed", "draft")).toBe(false);
    expect(canTransition("cancelled", "draft")).toBe(false);
    expect(() => assertTransition("draft", "claimed")).toThrow(InvalidTransitionError);
  });

  it("only writes an event when the conditional update hits", async () => {
    const db = {
      bottle: { updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }) },
      event: { create: vi.fn() },
    };
    expect(await transitionBottle(db as never, "b1", "awaiting_funding", "funded", { providerRef: "ref-1" })).toBe(true);
    expect(db.bottle.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "awaiting_funding" },
      data: { status: "funded" },
    });
    expect(db.event.create).toHaveBeenCalledTimes(1);
    expect(db.event.create.mock.calls[0]![0].data.providerRef).toBe("ref-1");

    expect(await transitionBottle(db as never, "b1", "awaiting_funding", "funded")).toBe(false);
    expect(db.event.create).toHaveBeenCalledTimes(1);
  });

  it("refuses illegal transitions before touching the database", async () => {
    const db = { bottle: { updateMany: vi.fn() }, event: { create: vi.fn() } };
    await expect(transitionBottle(db as never, "b1", "draft", "sealed")).rejects.toThrow(InvalidTransitionError);
    expect(db.bottle.updateMany).not.toHaveBeenCalled();
  });
});
