import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { caches } from '../caches.mts'
import { invalidate } from '../invalidate.mts'
import { getUrlHostnameCacheKeys } from '../keys.mts'

describe('best-effort entity cache invalidation', () => {
  it('reports hostname lookup failure without evicting the owned cache and retries successfully', async () => {
    const hostname = `invalidate-${randomUUID()}.example.com`
    const id = await insertTestUrlHostname({ hostname })
    const cached = { id, hostname }
    try {
      await caches.url_hostnames.set(id, cached)
      expect(await caches.url_hostnames.get(id)).toEqual(cached)

      const failure = await withPostgresPoolQueryFailureForTest(
        '/* getUrlHostnameCacheKeys */',
        () => invalidate.url_hostnames(id),
      )

      expect(failure.result).toBeUndefined()
      expect(failure.error).toMatchObject({ code: '25P02' })
      expect(sentryCaptureExceptionMock.mock.calls.some(([err]) => err === failure.error)).toBe(
        true,
      )
      expect(await caches.url_hostnames.get(id)).toEqual(cached)
      expect(await getUrlHostnameCacheKeys(id)).toEqual(expect.arrayContaining([id, hostname]))

      await expect(invalidate.url_hostnames(id)).resolves.toBeUndefined()
      expect(await caches.url_hostnames.get(id)).toBeNull()
    } finally {
      await caches.url_hostnames.invalidateCacheGetByAny(id, hostname)
    }
  })
})
