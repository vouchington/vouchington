import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  getOptionalRequestOrigin,
  runWithSessionRequestContext,
} from '../../modules/request-client-info/index.mts'
import { isDetachedBackgroundWork } from '@modules/utils/detached-background-work'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { caches } from './caches.mts'

describe('detached cache refresh', () => {
  it('marks only stale refresh work and reports its error with the request context', async () => {
    const staleKey = randomUUID()
    const coldKey = randomUUID()
    const refreshError = new Error('Owned stale refresh failure')
    const reported = Promise.withResolvers<unknown>()
    const originalCapture = sentryCaptureExceptionMock.getMockImplementation()
    const batches: { keys: string[]; detached: boolean; credential: string | undefined }[] = []
    const fetchBatch = async (keys: string[]) => {
      const detached = isDetachedBackgroundWork()
      batches.push({
        keys,
        detached,
        credential: getOptionalRequestOrigin()?.credential,
      })
      if (keys.includes(staleKey)) throw refreshError
      return keys.map(id => ({ id }))
    }

    try {
      sentryCaptureExceptionMock.mockImplementation((error, context) => {
        originalCapture?.(error, context)
        if (error === refreshError) reported.resolve(context)
      })
      // The product cache's one-hour TTL makes a one-minute owned entry stale immediately.
      await caches.topic_metrics.set(staleKey, { id: staleKey }, 60)
      const result = await runWithSessionRequestContext(
        {
          client: 'web',
          platform: 'web',
          appVersion: 'test',
          deviceId: randomUUID(),
          ipAddress: '::1',
        },
        () => caches.topic_metrics.cacheGetByAnyBatch(fetchBatch)([staleKey, coldKey]),
      )
      expect(result).toEqual([{ id: staleKey }, { id: coldKey }])
      await expect(reported.promise).resolves.toMatchObject({
        tags: { request_interface: 'rest', request_credential: 'session' },
      })
      expect(batches).toEqual([
        { keys: [staleKey], detached: true, credential: 'session' },
        { keys: [coldKey], detached: false, credential: 'session' },
      ])
    } finally {
      sentryCaptureExceptionMock.mockImplementation(originalCapture ?? (() => undefined))
      await caches.topic_metrics.delete(staleKey, coldKey)
    }
  })
})
