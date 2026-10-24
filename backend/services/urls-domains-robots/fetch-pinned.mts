import { cancelResponseBody, fetchWithTimeout } from '@modules/utils/http'
import { isTimeoutError } from '@vouchington/http-transport/fetch'
import { UnsafeUrlError, validateUrl } from 'ssrf-guard/node'

// ssrf-guard@1.0.0's validateUrl short-circuits to no timeout when both `signal` and `timeoutMs`
// are undefined, so every lookup passes an explicit bound.
const DNS_TIMEOUT_MS = 5000
const MAX_ROBOTS_REDIRECT_HOPS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type PinnedRobotsFetchDependencies = {
  validateUrl: typeof validateUrl
  fetchWithTimeout: typeof fetchWithTimeout
  unsafeUrlError: typeof UnsafeUrlError
  cancelResponseBody: typeof cancelResponseBody
}

/** Thrown when a robots.txt URL or redirect target fails SSRF validation. */
export class RobotsUnsafeTargetError extends Error {
  readonly url: string
  readonly reason: string

  constructor(url: string, reason: string) {
    super(`Unsafe robots.txt target: ${reason} (${url})`)
    this.name = 'RobotsUnsafeTargetError'
    this.url = url
    this.reason = reason
  }
}

export type PinnedRobotsFetchResult = {
  response: Response
  /** Aborts when the chain deadline, or the body-phase timer, expires. */
  bodySignal: AbortSignal
}

/**
 * Fetches robots.txt with SSRF-validated, pinned connections.
 * `timeoutMs` is the budget for the whole redirect chain, including the final body read.
 * Each hop is validated again. At most five redirects are followed (RFC 9309); a leftover
 * redirect is returned so the caller keeps its fail-closed path.
 */
export async function fetchPinnedRobotsTxt(
  url: string,
  timeoutMs: number,
  dependencies: PinnedRobotsFetchDependencies,
): Promise<PinnedRobotsFetchResult> {
  const deadline = Date.now() + timeoutMs
  let currentUrl = url

  for (let followed = 0; ; followed++) {
    const hopBudget = remainingMs(deadline)
    // oxlint-disable-next-line no-await-in-loop -- each robots.txt hop waits for its own SSRF check
    const resolvedAddresses = await resolveRobotsAddresses(currentUrl, hopBudget, dependencies)
    const fetchBudget = remainingMs(deadline)
    // oxlint-disable-next-line no-await-in-loop -- the next hop depends on this response
    const { response, responseSignal } = await dependencies.fetchWithTimeout({
      url: currentUrl,
      headers: {},
      requestTimeoutMs: fetchBudget,
      responseTimeoutMs: fetchBudget,
      resolvedAddresses,
    })

    if (!REDIRECT_STATUSES.has(response.status) || followed >= MAX_ROBOTS_REDIRECT_HOPS) {
      return finishPinnedResponse(response, responseSignal, deadline, dependencies)
    }

    const nextUrl = nextRobotsRedirectUrl(response, currentUrl)
    dependencies.cancelResponseBody(response)
    if (!nextUrl) {
      throw new RobotsUnsafeTargetError(currentUrl, 'redirect target is not an http(s) URL')
    }
    currentUrl = nextUrl
  }
}

async function resolveRobotsAddresses(
  url: string,
  hopBudgetMs: number,
  dependencies: PinnedRobotsFetchDependencies,
) {
  try {
    return await dependencies.validateUrl(url, {
      timeoutMs: Math.min(DNS_TIMEOUT_MS, hopBudgetMs),
    })
  } catch (err) {
    if (err instanceof dependencies.unsafeUrlError) {
      throw new RobotsUnsafeTargetError(url, err.reason)
    }
    // validateUrl reports a DNS timeout as AbortError. isNetworkError does not treat AbortError
    // as retryable, so remap it to TimeoutError and keep the existing retry-then-DISALLOW path.
    if (isTimeoutError(err)) {
      const timeout = new Error(err.message, { cause: err })
      timeout.name = 'TimeoutError'
      throw timeout
    }
    throw err
  }
}

function finishPinnedResponse(
  response: Response,
  responseSignal: AbortSignal,
  deadline: number,
  dependencies: PinnedRobotsFetchDependencies,
): PinnedRobotsFetchResult {
  // responseSignal starts when headers arrive and can outlive the chain deadline. The chain
  // signal is the cap the caller must pass into the body read.
  const bodySignal = AbortSignal.any([chainBodySignal(deadline), responseSignal])
  if (bodySignal.aborted) {
    dependencies.cancelResponseBody(response)
    throw timeoutFromSignal(bodySignal)
  }
  if (REDIRECT_STATUSES.has(response.status)) dependencies.cancelResponseBody(response)
  return { response, bodySignal }
}

function chainBodySignal(deadline: number): AbortSignal {
  const remaining = deadline - Date.now()
  if (remaining > 0) return AbortSignal.timeout(remaining)
  const timeout = new DOMException('robots.txt fetch timed out', 'TimeoutError')
  const controller = new AbortController()
  controller.abort(timeout)
  return controller.signal
}

function timeoutFromSignal(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  const timeout = new Error('robots.txt fetch timed out')
  timeout.name = 'TimeoutError'
  return timeout
}

function remainingMs(deadline: number): number {
  const remaining = deadline - Date.now()
  if (remaining > 0) return remaining
  const timeout = new Error('robots.txt fetch timed out')
  timeout.name = 'TimeoutError'
  throw timeout
}

function nextRobotsRedirectUrl(response: Response, currentUrl: string): string | null {
  const location = response.headers.get('location')
  if (!location) return null
  const next = URL.parse(location, currentUrl)
  if (!next) return null
  if (next.protocol !== 'http:' && next.protocol !== 'https:') return null
  return next.toString()
}
