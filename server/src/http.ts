import type { ErrorRequestHandler } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { InvalidTransitionError } from "./domain/bottleStateMachine.js";
import { LocktimeError } from "./bitcoin/locktime.js";
import { PubkeyError } from "./bitcoin/cltv.js";
import { ClaimError } from "./bitcoin/claim.js";
import { BroadcastError } from "./chain/mempool.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
  } else if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.flatten().fieldErrors });
  } else if (err instanceof LocktimeError || err instanceof PubkeyError || err instanceof ClaimError) {
    res.status(400).json({ error: err.message });
  } else if (err instanceof BroadcastError) {
    res.status(502).json({ error: `The Bitcoin network rejected the transaction: ${err.message}` });
  } else if (err instanceof InvalidTransitionError) {
    res.status(409).json({ error: `Bottle is ${err.from}; cannot move to ${err.to}` });
  } else if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON" });
  } else if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "Request is too large" });
  } else {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
};
