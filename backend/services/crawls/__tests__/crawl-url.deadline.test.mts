import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scopeCrawlDeadline } from '../crawl-url.mts'

const DEFAULT_TOTAL_CRAWL_TIMEOUT_MS = 60_000
const referenceTime = new Date(process.env.VOUCH_PROOF_NOW ?? '2026-01-01T00:00:00.000Z').getTime()

// Regression test for a bug found while verifying #10772: the original implementation only built
// a scoped options object when `options` was already truthy (`options && { ...options, deadlineAt }`),
// so a caller passing no options at all — the default path in
// `backend/workers/crawler/processors.mts` — never got a `deadlineAt` stamped, and every redirect
// hop silently restarted a fresh total-ceiling budget instead of inheriting the one before it.
describe('scopeCrawlDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(referenceTime)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stamps a fresh deadline when the caller passes no options', () => {
    const scoped = scopeCrawlDeadline(undefined)
    expect(scoped.deadlineAt).toBe(referenceTime + DEFAULT_TOTAL_CRAWL_TIMEOUT_MS)
  })

  it('respects an explicit totalTimeoutMs on the first hop', () => {
    const scoped = scopeCrawlDeadline({ totalTimeoutMs: 500 })
    expect(scoped.deadlineAt).toBe(referenceTime + 500)
  })

  it('inherits an existing deadlineAt unchanged instead of resetting it', () => {
    const inheritedDeadlineAt = referenceTime + 1234
    const scoped = scopeCrawlDeadline({ deadlineAt: inheritedDeadlineAt, totalTimeoutMs: 500 })
    expect(scoped.deadlineAt).toBe(inheritedDeadlineAt)
  })

  it('preserves every other option field untouched', () => {
    const scoped = scopeCrawlDeadline({ ignoreRobotsTxt: true, skipChunks: true })
    expect(scoped).toMatchObject({ ignoreRobotsTxt: true, skipChunks: true })
  })
})
