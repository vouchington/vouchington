import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  getOptionalRequestClientInfo,
  getOptionalRequestOrigin,
  runWithSessionRequestContext,
} from '../../modules/request-client-info/index.mts'
import { detachedBackgroundWork } from '@modules/utils/detached-background-work'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { getTopicMetricsByAnyBatch } from '../topics/metrics-batch.mts'
import { createRequestQueryProfile } from '../../test-helpers/query-profiles.mts'
import { readTestSentryScope, withTestSentryScope } from '../../test-helpers/sentry-scope.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { caches } from './caches.mts'

describe('detached cache refresh', () => {
  it('uses the detached runner by default for an app cache', async () => {
    const key = randomUUID()
    const cache = new ValkeyCache({ prefix: 'detached-default-test', ttlSeconds: 60 * 60 })
    const refreshed = Promise.withResolvers<boolean>()
    try {
      await cache.set(key, { id: key }, 60)
      const cached = cache.cacheGetByAny(async () => {
        refreshed.resolve(detachedBackgroundWork.isDetached())
        return { id: key }
      })
      await expect(cached(key)).resolves.toEqual({ id: key })
      await expect(refreshed.promise).resolves.toBe(true)
    } finally {
      await cache.delete(key)
    }
  })

  it('counts the cold SQL while excluding the stale refresh from repeats and serial depth', async () => {
    const staleKey = randomUUID()
    const coldKey = randomUUID()
    const annotation = 'getTopicMetricsByAnyBatch'
    const profile = createRequestQueryProfile()
    const refreshed = Promise.withResolvers<void>()
    const fetchBatch = async (keys: string[]) => {
      try {
        return await getTopicMetricsByAnyBatch(keys)
      } finally {
        if (keys.includes(staleKey)) refreshed.resolve()
      }
    }
    const cachedBatch = caches.topic_metrics.cacheGetByAnyBatch(fetchBatch)
    try {
      await caches.topic_metrics.set(staleKey, { id: staleKey }, 60)
      const values = await profile.run(() => cachedBatch([staleKey, coldKey]))
      await refreshed.promise
      expect(values[0]).toMatchObject({ id: staleKey })
      expect(values[1]).toBeNull()
      expect(profile.summarize()).toEqual({ totalQueries: 2, serialDepth: 1, repeats: [] })

      const awaitedProfile = createRequestQueryProfile()
      await awaitedProfile.run(async () => {
        await getTopicMetricsByAnyBatch([coldKey])
        await getTopicMetricsByAnyBatch([coldKey])
      })
      expect(awaitedProfile.summarize()).toEqual({
        totalQueries: 2,
        serialDepth: 2,
        repeats: [{ annotation, count: 2 }],
      })
    } finally {
      await caches.topic_metrics.delete(staleKey, coldKey)
    }
  })

  it('does not add a detached-only SQL refresh to request serial depth', async () => {
    const staleKey = randomUUID()
    const refreshed = Promise.withResolvers<void>()
    const profile = createRequestQueryProfile()
    const cachedBatch = caches.topic_metrics.cacheGetByAnyBatch(async keys => {
      try {
        return await getTopicMetricsByAnyBatch(keys)
      } finally {
        refreshed.resolve()
      }
    })
    try {
      await caches.topic_metrics.set(staleKey, { id: staleKey }, 60)
      const values = await profile.run(() => cachedBatch([staleKey]))
      await refreshed.promise
      expect(values[0]).toMatchObject({ id: staleKey })
      expect(profile.summarize()).toEqual({ totalQueries: 1, serialDepth: 0, repeats: [] })
    } finally {
      await caches.topic_metrics.delete(staleKey)
    }
  })

  it('marks only stale refresh work and reports its error with the request context', async () => {
    const staleKey = randomUUID()
    const coldKey = randomUUID()
    const requestId = randomUUID()
    const traceId = randomUUID().replaceAll('-', '')
    const refreshError = new Error('Owned stale refresh failure')
    const releaseRefresh = Promise.withResolvers<void>()
    const reported = Promise.withResolvers<{
      context: unknown
      sentryScope: ReturnType<typeof readTestSentryScope>
    }>()
    const originalCapture = sentryCaptureExceptionMock.getMockImplementation()
    const batches: {
      keys: string[]
      detached: boolean
      credential: string | undefined
      requestId: string | undefined
      sentryScope: ReturnType<typeof readTestSentryScope>
    }[] = []
    const fetchBatch = async (keys: string[]) => {
      const detached = detachedBackgroundWork.isDetached()
      batches.push({
        keys,
        detached,
        credential: getOptionalRequestOrigin()?.credential,
        requestId: getOptionalRequestClientInfo()?.requestId,
        sentryScope: readTestSentryScope(),
      })
      if (keys.includes(staleKey)) {
        await releaseRefresh.promise
        throw refreshError
      }
      return keys.map(id => ({ id }))
    }

    try {
      sentryCaptureExceptionMock.mockImplementation((error, context) => {
        originalCapture?.(error, context)
        if (error === refreshError) {
          reported.resolve({ context, sentryScope: readTestSentryScope() })
        }
      })
      // The product cache's one-hour TTL makes a one-minute owned entry stale immediately.
      await caches.topic_metrics.set(staleKey, { id: staleKey }, 60)
      const result = await withTestSentryScope(requestId, traceId, () =>
        runWithSessionRequestContext(
          {
            client: 'web',
            platform: 'web',
            appVersion: 'test',
            deviceId: randomUUID(),
            ipAddress: '::1',
            requestId,
          },
          () => caches.topic_metrics.cacheGetByAnyBatch(fetchBatch)([staleKey, coldKey]),
        ),
      )
      expect(result).toEqual([{ id: staleKey }, { id: coldKey }])
      expect(sentryCaptureExceptionMock.mock.calls.some(([error]) => error === refreshError)).toBe(
        false,
      )
      releaseRefresh.resolve()
      await expect(reported.promise).resolves.toEqual({
        context: expect.objectContaining({
          tags: expect.objectContaining({
            request_interface: 'rest',
            request_credential: 'session',
            request_id: requestId,
          }),
        }),
        sentryScope: { requestId, traceId },
      })
      expect(batches).toEqual([
        {
          keys: [staleKey],
          detached: true,
          credential: 'session',
          requestId,
          sentryScope: { requestId, traceId },
        },
        {
          keys: [coldKey],
          detached: false,
          credential: 'session',
          requestId,
          sentryScope: { requestId, traceId },
        },
      ])
    } finally {
      releaseRefresh.resolve()
      sentryCaptureExceptionMock.mockImplementation(originalCapture ?? (() => undefined))
      await caches.topic_metrics.delete(staleKey, coldKey)
    }
  })
})
