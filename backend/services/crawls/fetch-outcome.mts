/**
 * Shared mapping from a crawl or feed-fetch outcome to the timestamp column it stamps,
 * whether it records a hostname rate-limit window, and whether the worker job should rethrow.
 * Shared by RSS feed fetching and URL crawling so both dispatchers use the same state model.
 */
export type FetchOutcome =
  | { kind: 'content' }
  | { kind: 'redirect_hop' }
  | { kind: 'skipped' }
  | { kind: 'rate_limited' }
  | { kind: 'backoff_deferred' }
  | { kind: 'error'; isFinalAttempt: boolean }

export type FetchTimestampColumn = 'last_fetch_succeeded_at' | 'last_fetch_failed_at'

export type FetchOutcomeAction = {
  timestampColumn: FetchTimestampColumn | null
  recordHostnameRateLimit: boolean
  rethrow: boolean
}

export function resolveFetchOutcomeAction(outcome: FetchOutcome): FetchOutcomeAction {
  switch (outcome.kind) {
    case 'content':
      return {
        timestampColumn: 'last_fetch_succeeded_at',
        recordHostnameRateLimit: false,
        rethrow: false,
      }
    case 'redirect_hop':
      return {
        timestampColumn: null,
        recordHostnameRateLimit: false,
        rethrow: false,
      }
    case 'skipped':
      return {
        timestampColumn: 'last_fetch_failed_at',
        recordHostnameRateLimit: false,
        rethrow: false,
      }
    case 'rate_limited':
      return {
        timestampColumn: null,
        recordHostnameRateLimit: true,
        rethrow: false,
      }
    case 'backoff_deferred':
      return {
        timestampColumn: null,
        recordHostnameRateLimit: false,
        rethrow: false,
      }
    case 'error':
      return {
        timestampColumn: outcome.isFinalAttempt ? 'last_fetch_failed_at' : null,
        recordHostnameRateLimit: false,
        rethrow: true,
      }
  }
}
