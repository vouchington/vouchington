import { cancelResponseBody, fetchWithTimeout, isTimeoutError } from '@modules/utils/http'
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

/**
 * Fetches robots.txt with SSRF-validated, pinned connections.
 * `timeoutMs` is the budget for the whole redirect chain, matching the previous single
 * `fetchWithTimeoutSimple` timeout. Each hop is validated again. At most five redirects are
 * followed (RFC 9309); a leftover redirect is returned so the caller keeps its fail-closed path.
 */
export async function fetchPinnedRobotsTxt(
  url: string,
  timeoutMs: number,
  dependencies: PinnedRobotsFetchDependencies,
): Promise<Response> {
  const deadline = Date.now() + timeoutMs
  let currentUrl = url

  for (let followed = 0; ; followed++) {
    const hopBudget = remainingMs(deadline)
    // oxlint-disable-next-line no-await-in-loop -- each robots.txt hop waits for its own SSRF check
    const resolvedAddresses = await resolveRobotsAddresses(currentUrl, hopBudget, dependencies)
    const fetchBudget = remainingMs(deadline)
    // oxlint-disable-next-line no-await-in-loop -- the next hop depends on this response
    const { response } = await dependencies.fetchWithTimeout({
      url: currentUrl,
      headers: {},
      requestTimeoutMs: fetchBudget,
      responseTimeoutMs: fetchBudget,
      resolvedAddresses,
    })

    if (!REDIRECT_STATUSES.has(response.status) || followed >= MAX_ROBOTS_REDIRECT_HOPS) {
      if (REDIRECT_STATUSES.has(response.status)) dependencies.cancelResponseBody(response)
      return response
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
    // as retryable, so remap it to TimeoutError and keep the existing retry-then-ALLOW path.
    if (isTimeoutError(err)) {
      const timeout = new Error(err.message, { cause: err })
      timeout.name = 'TimeoutError'
      throw timeout
    }
    throw err
  }
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
