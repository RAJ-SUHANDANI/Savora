/**
 * API route helpers.
 *
 * Small, explicit helpers rather than a framework: every endpoint returns the
 * same JSON envelope shape, so the client can handle errors uniformly without
 * guessing which endpoint returns what.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { clientIp, limit } from "./rate-limit";

export type ApiError = {
  error: string;
  /** Field-level messages, keyed by field name, for inline form errors. */
  fields?: Record<string, string>;
  code?: string;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(
  error: string,
  options?: { status?: number; code?: string; fields?: Record<string, string> },
) {
  return NextResponse.json<ApiError>(
    { error, code: options?.code, fields: options?.fields },
    { status: options?.status ?? 400 },
  );
}

/**
 * Turns a ZodError into a 400 with per-field messages.
 * Returns `null` when validation passed, so routes read as:
 *   const invalid = validationError(result);
 *   if (invalid) return invalid;
 */
export function validationError(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    // Keep the first message per field: it is the most specific, and later
    // issues on the same field are usually consequences of the first.
    if (!fields[key]) fields[key] = issue.message;
  }
  return fail("Please check the highlighted fields", {
    status: 422,
    code: "VALIDATION",
    fields,
  });
}

/**
 * Wraps a handler so an unexpected throw becomes a 500 instead of a stack trace.
 *
 * Generic over whatever the route returns, because routes legitimately return
 * different shapes: `ok(data)`, `fail(reason, { fields })`, or a bare
 * `NextResponse.json`. The cast is confined to the catch branch, where a JSON
 * error body is the only sensible thing left to send.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[api] unhandled error:", err);
    return fail("Something went wrong on our end. Please try again.", {
      status: 500,
      code: "INTERNAL",
    }) as T;
  }
}

/**
 * Reservation rate-limit policy: 8 bookings per IP per hour.
 *
 * Returns a ready-to-send response or `null`, so a route reads as:
 *   const limited = await guardReservationRateLimit(request);
 *   if (limited) return limited;
 * The `Retry-After` header is set here rather than by the route, because a 429
 * without it is just an error message.
 */
export async function guardReservationRateLimit(request: Request) {
  const ip = clientIp(request.headers);
  const result = await limit(`reserve:${ip}`, 8, 60 * 60);
  if (!result.success) {
    return fail("Too many booking attempts from this connection. Please try again later.", {
      status: 429,
      code: "RATE_LIMITED",
    });
  }
  return null;
}
