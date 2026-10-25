import { write } from '@data-stores/psql'
import {
  CrawlerHttpClientError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  HttpNoBodyError,
  isCrawlerNetworkDnsError,
  isCrawlerNetworkTlsHostnameError,
} from '@modules/on-error/errors'
import { trackNetworkBackoffClosed, trackNetworkBackoffOpened } from '@services/analytics'

/** Consecutive counted failures that open the backoff; one URL's retry budget is 3. */
export const NETWORK_BACKOFF_FAILURE_THRESHOLD = 10
/** The step is capped rather than the duration so analytics can derive the step from it. */
export const NETWORK_BACKOFF_MAX_STEP = 5
const NETWORK_BACKOFF_BASE_SECONDS = 60 * 60
const NETWORK_BACKOFF_PROBE_WINDOW_SECONDS = 15 * 60

type BackoffCrawlerType = 'html' | 'rss'

export function getNetworkBackoffDurationMs(step: number): number {
  return NETWORK_BACKOFF_BASE_SECONDS * 1000 * 2 ** (step - 1)
}

/**
 * A connection-level failure where the hostname never answered. DNS failures and TLS hostname
 * mismatches keep their own configuration-failure latch; timeouts are not counted.
 */
export function isHostnameUnreachableError(error: unknown): error is CrawlerNetworkError {
  return (
    error instanceof CrawlerNetworkError &&
    !isCrawlerNetworkDnsError(error) &&
    !isCrawlerNetworkTlsHostnameError(error)
  )
}

/** The hostname answered with an HTTP response, even if the crawl failed. */
export function isHostnameAnsweredError(error: unknown): boolean {
  return (
    error instanceof CrawlerRateLimitError ||
    error instanceof CrawlerServerError ||
    error instanceof CrawlerHttpClientError ||
    error instanceof CrawlerResponseSizeExceededError ||
    error instanceof HttpNoBodyError
  )
}

// A claimed probe failed, or the threshold was reached without any HTTP response.
const OPENS = `(network_backoff_probe_claimed_at IS NOT NULL
  OR consecutive_network_failures + 1 >= $2)`
const NEXT_STEP = `LEAST(network_backoff_step + 1, $3)`

/**
 * Records a non-DNS network failure (the hostname never answered). Opens the backoff once the
 * threshold is reached, and reopens it at the next step when the claimed probe fails. Failures
 * from jobs already in flight while the backoff is open and unprobed are ignored.
 */
export async function recordHostnameNetworkFailure(
  hostnameId: string,
  crawlerType: BackoffCrawlerType,
): Promise<void> {
  // Single atomic UPDATE: CASE expressions see the locked row's latest committed values.
  const { rows } = await write<{ hostname: string; step: number; opened: boolean }>(
    `/* recordHostnameNetworkFailure */
    UPDATE url_hostnames SET
      consecutive_network_failures = CASE WHEN ${OPENS} THEN 0
        ELSE consecutive_network_failures + 1 END,
      network_backoff_step = CASE WHEN ${OPENS} THEN ${NEXT_STEP} ELSE network_backoff_step END,
      network_backoff_ends_at = CASE WHEN ${OPENS}
        THEN CURRENT_TIMESTAMP + make_interval(secs => $4 * power(2, ${NEXT_STEP} - 1))
        ELSE network_backoff_ends_at END,
      network_backoff_probe_claimed_at = NULL
    WHERE id = $1
      AND (network_backoff_ends_at IS NULL
        OR network_backoff_ends_at <= CURRENT_TIMESTAMP
        OR network_backoff_probe_claimed_at IS NOT NULL)
    RETURNING hostname, network_backoff_step AS step, consecutive_network_failures = 0 AS opened
  `,
    [
      hostnameId,
      NETWORK_BACKOFF_FAILURE_THRESHOLD,
      NETWORK_BACKOFF_MAX_STEP,
      NETWORK_BACKOFF_BASE_SECONDS,
    ],
  )
  const row = rows[0]
  if (!row?.opened) return
  trackNetworkBackoffOpened(crawlerType, row.hostname, getNetworkBackoffDurationMs(row.step))
}

/**
 * Claims the single probe allowed after an open backoff expires. The claim pushes
 * network_backoff_ends_at out by the probe window, so exactly one concurrent caller wins and a
 * probe that never reports back is retried after the window.
 */
export async function claimHostnameNetworkProbe(hostnameId: string): Promise<boolean> {
  const { rows } = await write<{ id: string }>(
    `/* claimHostnameNetworkProbe */
    UPDATE url_hostnames SET
      network_backoff_ends_at = CURRENT_TIMESTAMP + make_interval(secs => $2),
      network_backoff_probe_claimed_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND network_backoff_step > 0
      AND network_backoff_ends_at <= CURRENT_TIMESTAMP
    RETURNING id
  `,
    [hostnameId, NETWORK_BACKOFF_PROBE_WINDOW_SECONDS],
  )
  return rows.length > 0
}

/**
 * Whether a crawl or fetch of the hostname may proceed. While the backoff is open it is skipped
 * (never deferred); once it expires only the caller that claims the probe proceeds.
 */
export async function isOutsideHostnameNetworkBackoff(hostname: {
  id: string
  network_backoff_step: number
  network_backoff_ends_at: Date | null
}): Promise<boolean> {
  if (hostname.network_backoff_ends_at && hostname.network_backoff_ends_at.getTime() > Date.now()) {
    return false
  }
  if (hostname.network_backoff_step === 0) return true
  return claimHostnameNetworkProbe(hostname.id)
}

/**
 * Resets failure state after the hostname answered. Any HTTP response closes the network
 * backoff; only a successful crawl or fetch (includeDns) also resets the DNS counter. The row is
 * locked and written only when there is something to reset.
 */
export async function resetHostnameFailures(
  hostnameId: string,
  options: { crawlerType: BackoffCrawlerType; includeDns: boolean },
): Promise<void> {
  const { rows } = await write<{ hostname: string; closed_step: number }>(
    `/* resetHostnameFailures */
    UPDATE url_hostnames h SET
      consecutive_dns_failures = CASE WHEN $2 THEN 0 ELSE h.consecutive_dns_failures END,
      consecutive_network_failures = 0,
      network_backoff_step = 0,
      network_backoff_ends_at = NULL,
      network_backoff_probe_claimed_at = NULL
    FROM (
      SELECT id, network_backoff_step
      FROM url_hostnames
      WHERE id = $1
        AND (($2 AND consecutive_dns_failures > 0)
          OR consecutive_network_failures > 0
          OR network_backoff_step > 0)
      FOR UPDATE
    ) previous
    WHERE h.id = previous.id
    RETURNING h.hostname, previous.network_backoff_step AS closed_step
  `,
    [hostnameId, options.includeDns],
  )
  const row = rows[0]
  if (!row || row.closed_step === 0) return
  trackNetworkBackoffClosed(
    options.crawlerType,
    row.hostname,
    getNetworkBackoffDurationMs(row.closed_step),
  )
}
