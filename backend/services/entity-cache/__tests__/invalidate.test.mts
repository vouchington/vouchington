import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { cachePurge } from '@queues/cache-purge/queues'
import { hostnameTag, storyTag } from '@ts-shared/cache'
import { caches } from '../caches.mts'
import { invalidate } from '../invalidate.mts'
import { getUrlHostnameCacheKeys } from '../keys.mts'

describe('best-effort entity cache invalidation', () => {
  it('waits for actual purge admission without waiting for a worker result', async () => {
    const hostname = `purge-admission-${randomUUID()}.example.com`
    const id = await insertTestUrlHostname({ hostname })
    const tag = hostnameTag(hostname)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const original = cachePurge.addBulk
    let admitted: ReturnType<typeof cachePurge.addBulk> | undefined
    const spy = vi.spyOn(cachePurge, 'addBulk').mockImplementation(async jobs => {
      if (
        !jobs.some(
          job =>
            typeof job.data === 'object' &&
            job.data !== null &&
            'tags' in job.data &&
            Array.isArray(job.data.tags) &&
            job.data.tags.includes(tag),
        )
      )
        return original.call(cachePurge, jobs)
      entered.resolve()
      await release.promise
      admitted = original.call(cachePurge, jobs)
      return admitted
    })
    let operation: Promise<void> | undefined
    onTestFinished(async () => {
      release.resolve()
      try {
        await operation
        if (admitted) await Promise.all((await admitted).map(job => job.remove()))
      } finally {
        spy.mockRestore()
        await caches.url_hostnames.invalidateCacheGetByAny(id, hostname)
      }
    })
    await caches.url_hostnames.set(id, { id, hostname })
    let completed = false
    operation = invalidate.url_hostnames(id).then(() => {
      completed = true
      return undefined
    })
    await entered.promise
    expect(await caches.url_hostnames.get(id)).toBeNull()
    expect(completed).toBe(false)
    release.resolve()
    await operation
    expect(completed).toBe(true)
    expect((await admitted!)?.map(job => job.data)).toEqual([
      { tags: expect.arrayContaining([hostnameTag(id), hostnameTag(hostname)]) },
    ])
    // The project doesn't preload cache-purge workers, so the real job stays delayed after admission.
    expect(await Promise.all((await admitted!).map(job => job.getState()))).toEqual(['delayed'])
  })

  it.each(['rejected promise', 'synchronous queue throw'] as const)(
    'reports rejected purge admission once and preserves best-effort completion (%s)',
    async failureMode => {
      const id = randomUUID()
      const tag = storyTag(id)
      const failure = new Error('Owned cache purge admission rejection')
      const original = cachePurge.addBulk
      const spy = vi.spyOn(cachePurge, 'addBulk').mockImplementation(jobs => {
        if (
          !jobs.some(
            job =>
              typeof job.data === 'object' &&
              job.data !== null &&
              'tags' in job.data &&
              Array.isArray(job.data.tags) &&
              job.data.tags.includes(tag),
          )
        )
          return original.call(cachePurge, jobs)
        if (failureMode === 'synchronous queue throw') throw failure
        return Promise.reject(failure)
      })
      try {
        await expect(invalidate.stories(id)).resolves.toBeUndefined()
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
        ).toHaveLength(1)
      } finally {
        spy.mockRestore()
      }
    },
  )

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
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure.error),
      ).toHaveLength(1)
      expect(await caches.url_hostnames.get(id)).toEqual(cached)
      expect(await getUrlHostnameCacheKeys(id)).toEqual(expect.arrayContaining([id, hostname]))

      await expect(invalidate.url_hostnames(id)).resolves.toBeUndefined()
      expect(await caches.url_hostnames.get(id)).toBeNull()
    } finally {
      await caches.url_hostnames.invalidateCacheGetByAny(id, hostname)
    }
  })
})
