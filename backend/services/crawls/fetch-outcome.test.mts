import { describe, expect, it } from 'vitest'
import { resolveFetchOutcomeAction, type FetchOutcome } from './fetch-outcome.mts'

describe('resolveFetchOutcomeAction', () => {
  it.each([
    [
      'content (200 or 304)',
      { kind: 'content' },
      {
        timestampColumn: 'last_fetch_succeeded_at',
        recordHostnameRateLimit: false,
        rethrow: false,
      },
    ],
    [
      'redirect hop',
      { kind: 'redirect_hop' },
      { timestampColumn: null, recordHostnameRateLimit: false, rethrow: false },
    ],
    [
      'policy skip (uncrawlable, Web Risk 400, robots disallow)',
      { kind: 'skipped' },
      { timestampColumn: 'last_fetch_failed_at', recordHostnameRateLimit: false, rethrow: false },
    ],
    [
      'rate limited (Valkey lock or HTTP 429)',
      { kind: 'rate_limited' },
      { timestampColumn: null, recordHostnameRateLimit: true, rethrow: false },
    ],
    [
      'network backoff deferred',
      { kind: 'backoff_deferred' },
      { timestampColumn: null, recordHostnameRateLimit: false, rethrow: false },
    ],
    [
      'thrown error on non-final job attempt',
      { kind: 'error', isFinalAttempt: false },
      { timestampColumn: null, recordHostnameRateLimit: false, rethrow: true },
    ],
    [
      'thrown error on final job attempt',
      { kind: 'error', isFinalAttempt: true },
      { timestampColumn: 'last_fetch_failed_at', recordHostnameRateLimit: false, rethrow: true },
    ],
  ] as [string, FetchOutcome, ReturnType<typeof resolveFetchOutcomeAction>][])(
    'maps %s to the expected persistence and retry action',
    (_label, outcome, expected) => {
      expect(resolveFetchOutcomeAction(outcome)).toEqual(expected)
    },
  )
})
