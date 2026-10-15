import { isRetryableTransportError } from '../../transport-errors.mts'

// Bounded retry at the single chokepoint the web-integration suite uses to talk to the Worker.
// Makes wrangler's supervised restart (cloudflare-worker/scripts/wrangler/restart-policy.mts,
// #10819) transparent to tests when a request lands in its restart window.

// Resolve the normal global timer at each real backoff, including under an owned injected clock.
function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

const RETRY_BACKOFFS_MS = [250, 500, 1_000, 2_000, 2_000]
// Total time budget for the retry phase (all backoffs + all retry attempts), measured from the
// first failure. Generous against the measured ~3.5s wrangler restart window. The first attempt's
// own timeout is not part of this budget -- see fetchWithTransportRetry.
const RETRY_BUDGET_MS = 12_000
// Per-attempt ceiling applied only to retry attempts, not the first one, so a socket that hangs
// rather than errors during a restart window fails fast enough to retry again within budget instead
// of burning the caller's full request timeout on every attempt.
const RETRY_ATTEMPT_TIMEOUT_MS = 5_000
const DEFAULT_FIRST_ATTEMPT_TIMEOUT_MS = 20_000
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isIdempotentHttpMethod(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase())
}

export interface FetchWithTransportRetryOptions {
  // Returns false for a resolved response that must not escape the caller's boundary. The helper
  // owns disposal and bounded retries; callers own their response contract.
  acceptResponse?: (response: Response) => boolean
  idempotent?: boolean
  label: string
  method: string
  timeoutMs?: number
}

export class FetchResponseRejectedError extends Error {
  readonly status: number
  readonly statusText: string
  readonly url: string

  constructor(label: string, response: Response) {
    const { status, statusText, url } = response
    super(`[fetch-retry] ${label}: rejected response (${status} ${statusText}) at ${url}`)
    this.name = 'FetchResponseRejectedError'
    this.status = status
    this.statusText = statusText
    this.url = url
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  const cause = error.cause as { code?: unknown } | undefined
  return typeof cause?.code === 'string' ? cause.code : error.name
}

function disposeRejectedResponse(response: Response): void {
  // Cancellation releases the rejected stream, but must not delay its retry deadline.
  void response.body?.cancel().catch(() => {})
}

// Retries a fetch() on retryable transport failures and caller-rejected resolved responses. The
// latter are retried only for idempotent calls. Returns the real accepted Response so callers keep
// .url/.redirected semantics; bodies are never buffered or reconstructed here. `init` must not set
// `signal`: a fresh, per-attempt AbortSignal is constructed on every attempt so a retry never
// reuses an already-elapsed one.
export async function fetchWithTransportRetry(
  url: string | URL,
  init: Omit<RequestInit, 'signal'>,
  options: FetchWithTransportRetryOptions,
): Promise<Response> {
  const idempotent = options.idempotent ?? isIdempotentHttpMethod(options.method)
  const firstAttemptTimeoutMs = options.timeoutMs ?? DEFAULT_FIRST_ATTEMPT_TIMEOUT_MS
  let retryDeadline: number | undefined
  let lastError: unknown
  let attempt = 0

  for (;;) {
    attempt++
    const attemptTimeoutMs =
      attempt === 1
        ? firstAttemptTimeoutMs
        : Math.min(RETRY_ATTEMPT_TIMEOUT_MS, retryDeadline! - Date.now())

    if (attempt > 1 && attemptTimeoutMs <= 0) throw lastError

    let response: Response
    try {
      // oxlint-disable-next-line no-await-in-loop -- each attempt must settle (or hit its own ceiling) before deciding whether to retry
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(attemptTimeoutMs) })
    } catch (err) {
      lastError = err
      if (!isRetryableTransportError(err, idempotent)) throw err

      if (attempt === 1) retryDeadline = Date.now() + RETRY_BUDGET_MS

      const backoffMs = RETRY_BACKOFFS_MS[attempt - 1]
      if (backoffMs === undefined || retryDeadline! - Date.now() <= backoffMs) throw err

      process.stderr.write(
        `[fetch-retry] ${options.label}: attempt ${attempt} failed (${describeError(err)}), retrying in ${backoffMs}ms\n`,
      )
      // oxlint-disable-next-line no-await-in-loop -- intentional backoff between retry attempts.
      await delay(backoffMs)
      continue
    }

    if (options.acceptResponse?.(response) !== false) return response

    disposeRejectedResponse(response)
    const error = new FetchResponseRejectedError(options.label, response)
    if (!idempotent) throw error
    lastError = error

    if (attempt === 1) retryDeadline = Date.now() + RETRY_BUDGET_MS

    const backoffMs = RETRY_BACKOFFS_MS[attempt - 1]
    if (backoffMs === undefined || retryDeadline! - Date.now() <= backoffMs) throw error

    process.stderr.write(
      `[fetch-retry] ${options.label}: attempt ${attempt} returned a rejected response, retrying in ${backoffMs}ms\n`,
    )
    // oxlint-disable-next-line no-await-in-loop -- intentional backoff between retry attempts.
    await delay(backoffMs)
  }
}

// Retries a whole async operation (not a single fetch) on a retryable transport error, using the
// same backoff schedule and total budget as fetchWithTransportRetry. For operations -- like
// WebIntegrationClient.login() -- whose *inner* request is unsafe to retry blindly at the transport
// level (a fixed one-time token) but where redoing the entire operation from scratch is safe by
// construction. Each attempt already carries its own timeout (e.g. via an inner
// fetchWithTransportRetry call), so unlike fetchWithTransportRetry this does not need a
// deadline-aware per-attempt ceiling.
export async function retryOnTransportError<T>(
  attempt: () => Promise<T>,
  options: { idempotent: boolean; label: string },
): Promise<T> {
  let retryDeadline: number | undefined
  let attemptNumber = 0

  for (;;) {
    attemptNumber++
    try {
      // oxlint-disable-next-line no-await-in-loop -- each attempt must settle before deciding whether to retry the whole operation
      return await attempt()
    } catch (err) {
      if (!isRetryableTransportError(err, options.idempotent)) throw err

      if (attemptNumber === 1) retryDeadline = Date.now() + RETRY_BUDGET_MS

      const backoffMs = RETRY_BACKOFFS_MS[attemptNumber - 1]
      if (backoffMs === undefined || retryDeadline! - Date.now() <= backoffMs) throw err

      process.stderr.write(
        `[fetch-retry] ${options.label}: attempt ${attemptNumber} failed (${describeError(err)}), retrying whole operation in ${backoffMs}ms\n`,
      )
      // oxlint-disable-next-line no-await-in-loop -- intentional backoff between retry attempts.
      await delay(backoffMs)
    }
  }
}
