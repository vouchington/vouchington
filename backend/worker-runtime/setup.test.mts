import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as bloomFilterMaintenance from '@services/bloom-filter-maintenance'
import { sentryCaptureExceptionMock } from '../test-helpers/vitest.setup.sentry-mock.mts'
import { setup } from './setup.mts'

/** Resolves with the first error `onError` forwards to Sentry that matches `matches`. */
function nextReportedError(matches: (err: Error) => boolean): Promise<Error> {
  return new Promise(resolve => {
    sentryCaptureExceptionMock.mockImplementation((err: Error) => {
      if (matches(err)) resolve(err)
    })
  })
}

describe('setup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('refuses to start without API_KEY_CHECKSUM_SECRET', async () => {
    vi.stubEnv('API_KEY_CHECKSUM_SECRET', '')

    await expect(setup()).rejects.toThrow(
      'API_KEY_CHECKSUM_SECRET is not set — worker cannot start without it',
    )
  })

  it('warms the bloom filters against the real stores and resolves', async () => {
    await expect(setup()).resolves.toBeUndefined()
  })

  it('reports a failing hygiene sweep without failing worker startup', async () => {
    const sweepError = new Error(`sweep boom ${randomUUID()}`)
    const reported = nextReportedError(err => err === sweepError)
    vi.spyOn(bloomFilterMaintenance, 'sweepBookmarkBloomFiltersMissingTtl').mockRejectedValue(
      sweepError,
    )

    await expect(setup()).resolves.toBeUndefined()
    await expect(reported).resolves.toBe(sweepError)
  })

  it('wraps a non-Error sweep rejection before reporting it', async () => {
    const reason = `sweep string ${randomUUID()}`
    const reported = nextReportedError(err => err.message === reason)
    vi.spyOn(bloomFilterMaintenance, 'sweepBookmarkBloomFiltersMissingTtl').mockRejectedValue(
      reason,
    )

    await expect(setup()).resolves.toBeUndefined()
    await expect(reported).resolves.toEqual(new Error(reason))
  })
})
