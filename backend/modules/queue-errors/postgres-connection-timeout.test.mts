import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_RATE_LIMIT_DEFERRAL_AGE_MS } from './rate-limit.mts'
import { deferPostgresConnectionTimeout } from './postgres-connection-timeout.mts'

const UTC_BOUNDARIES = [
  '2024-02-29T23:59:59.999Z',
  '2024-03-01T00:00:00.001Z',
  '2024-12-31T23:59:59.999Z',
  '2025-01-01T00:00:00.001Z',
] as const

describe('deferPostgresConnectionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(UTC_BOUNDARIES[0]))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('preserves the original connection timeout as the deferral cause', async () => {
    const cause = new Error('Connection terminated due to connection timeout')
    const signal = await deferPostgresConnectionTimeout({ timestamp: Date.now() }, async () => {
      throw cause
    }).catch((err: unknown) => err)

    expect(signal).toMatchObject({ name: 'RateLimitError', delayMs: 30_000, cause })
  })

  it('leaves unrelated errors on the ordinary retry path', async () => {
    const cause = new Error('relation does not exist')
    await expect(
      deferPostgresConnectionTimeout({ timestamp: Date.now() }, async () => {
        throw cause
      }),
    ).rejects.toBe(cause)
  })

  it.each(UTC_BOUNDARIES)(
    'keeps the connection timeout deferral one millisecond inside the window at %s',
    async now => {
      const cause = new Error('timeout exceeded when trying to connect')
      vi.setSystemTime(new Date(now))
      const job = { timestamp: Date.now() - MAX_RATE_LIMIT_DEFERRAL_AGE_MS + 1 }
      const thrown: unknown = await deferPostgresConnectionTimeout(job, async () => {
        throw cause
      }).catch((err: unknown) => err)
      expect(thrown).toMatchObject({ name: 'RateLimitError', delayMs: 30_000, cause })
    },
  )

  it.each(
    UTC_BOUNDARIES.flatMap(now => [
      { now, ageMs: MAX_RATE_LIMIT_DEFERRAL_AGE_MS, boundary: 'at cap' },
      { now, ageMs: MAX_RATE_LIMIT_DEFERRAL_AGE_MS + 1, boundary: 'one millisecond past cap' },
    ]),
  )('spends attempts for a connection timeout $boundary at $now', async ({ now, ageMs }) => {
    const cause = new Error('timeout exceeded when trying to connect')
    vi.setSystemTime(new Date(now))
    const job = { timestamp: Date.now() - ageMs }
    await expect(
      deferPostgresConnectionTimeout(job, async () => {
        throw cause
      }),
    ).rejects.toBe(cause)
  })
})
