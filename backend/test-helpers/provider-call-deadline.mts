import type { StructuredDecisionClient } from '@modules/structured-decisions'

/** A smoke-test call that has not answered by now is a stall, not latency. */
export const SMOKE_CALL_DEADLINE_MS = 3_000

/** A live provider call that did not answer within its deadline; names the call that stalled. */
export class ProviderCallDeadlineError extends Error {
  constructor(label: string, deadlineMs: number, cause: unknown) {
    super(`${label}: no provider response within ${deadlineMs}ms`, { cause })
    this.name = 'ProviderCallDeadlineError'
  }
}

/**
 * Runs one live provider call under its own deadline. `call` must hand the signal to the provider
 * client so the stalled request is cancelled instead of left running.
 */
export async function callWithDeadline<T>(
  label: string,
  deadlineMs: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(deadlineMs)
  try {
    return await call(signal)
  } catch (err) {
    if (signal.aborted) throw new ProviderCallDeadlineError(label, deadlineMs, err)
    throw err
  }
}

/**
 * The smoke-test form: each attempt gets its own deadline and a failed attempt is retried once.
 * Evals use `callWithDeadline` alone so a manual run surfaces a stall.
 */
export async function callWithDeadlineAndOneRetry<T>(
  label: string,
  deadlineMs: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  try {
    return await callWithDeadline(label, deadlineMs, call)
  } catch {
    return callWithDeadline(`${label} (retry)`, deadlineMs, call)
  }
}

/** The same client with `signal` as the default cancellation for calls that pass none. */
export function structuredDecisionClientWithSignal(
  client: StructuredDecisionClient,
  signal: AbortSignal,
): StructuredDecisionClient {
  return {
    decide: (request, callerSignal) =>
      client.decide(request, callerSignal ? AbortSignal.any([callerSignal, signal]) : signal),
  }
}
