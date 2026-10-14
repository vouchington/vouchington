import { describe, expect, it } from 'vitest'
import { MAX_RATE_LIMIT_DEFERRAL_AGE_MS } from './rate-limit.mts'
import { deferPostgresConnectionTimeout } from './postgres-connection-timeout.mts'

describe('deferPostgresConnectionTimeout', () => {
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

  it('spends attempts after the connection-wait deferral age is exhausted', async () => {
    const cause = new Error('timeout exceeded when trying to connect')
    const oldJob = { timestamp: Date.now() - MAX_RATE_LIMIT_DEFERRAL_AGE_MS - 1_000 }
    await expect(
      deferPostgresConnectionTimeout(oldJob, async () => {
        throw cause
      }),
    ).rejects.toBe(cause)
  })
})
