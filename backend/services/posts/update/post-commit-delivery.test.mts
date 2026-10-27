import { describe, expect, it, vi, onTestFinished } from 'vitest'
import { finalizePostUpdateAndDeliver } from './post-commit-delivery.mts'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { ENTITY_LISTENERS_POST_UPDATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { caches } from '@services/entity-cache/caches'
import { entityCacheBloomFilters } from '@services/entity-cache/bloom-filter-instances'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  createPostCompletionFixture,
  drainOwnedTestAction,
} from '../../../test-helpers/post-commit-completion.mts'

async function fixture() {
  const { post } = await createPostCompletionFixture()
  return {
    changes: { title: 'captured' },
    contentChanged: true,
    previousPost: post,
    shouldEnqueuePostUpdated: true,
    updatedPost: post,
  }
}

describe('finalizePostUpdateAndDeliver', () => {
  it('returns the transaction-captured post and sends one update event', async () => {
    const input = await fixture()
    const originalAdd = entitiesListeners.add
    const calls: unknown[] = []
    const spy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
      if (
        name === ENTITY_LISTENERS_POST_UPDATED_JOB.name &&
        data &&
        typeof data === 'object' &&
        'id' in data &&
        data.id === input.updatedPost.id
      )
        calls.push(data)
      return originalAdd.call(entitiesListeners, name, data, options)
    })
    onTestFinished(() => spy.mockRestore())
    await expect(finalizePostUpdateAndDeliver(input)).resolves.toBe(input.updatedPost)
    expect(calls).toEqual([{ id: input.updatedPost.id, contentChanged: true }])
  })

  it('reports cache failure without rejecting a committed post update', async () => {
    const input = await fixture()
    const error = new Error('Owned cache unavailable')
    const originalDelete = ValkeyCache.deleteFromCaches
    const cacheSpy = vi.spyOn(ValkeyCache, 'deleteFromCaches').mockImplementation(groups => {
      if (
        groups.some(
          group => group.cache === caches.posts && group.keys.includes(input.updatedPost.id),
        )
      )
        return Promise.reject(error)
      return originalDelete.call(ValkeyCache, groups)
    })
    const originalAdd = entitiesListeners.add
    const calls: unknown[] = []
    const queueSpy = vi
      .spyOn(entitiesListeners, 'add')
      .mockImplementation((name, data, options) => {
        if (
          name === ENTITY_LISTENERS_POST_UPDATED_JOB.name &&
          data &&
          typeof data === 'object' &&
          'id' in data &&
          data.id === input.updatedPost.id
        )
          calls.push(data)
        return originalAdd.call(entitiesListeners, name, data, options)
      })
    onTestFinished(() => {
      cacheSpy.mockRestore()
      queueSpy.mockRestore()
    })
    await expect(
      finalizePostUpdateAndDeliver({ ...input, changes: {}, contentChanged: false }),
    ).resolves.toBe(input.updatedPost)
    expect(calls).toEqual([{ id: input.updatedPost.id, contentChanged: false }])
    expect(sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === error)).toHaveLength(1)
  })

  it('drains both cache and listener admissions before returning the captured response', async () => {
    const input = await fixture()
    const cacheStarted = Promise.withResolvers<void>()
    const queueStarted = Promise.withResolvers<void>()
    const cacheRelease = Promise.withResolvers<void>()
    const queueRelease = Promise.withResolvers<void>()
    const queueFinished = Promise.withResolvers<void>()
    const originalDelete = ValkeyCache.deleteFromCaches
    const cacheSpy = vi.spyOn(ValkeyCache, 'deleteFromCaches').mockImplementation(groups => {
      if (
        !groups.some(
          group => group.cache === caches.posts && group.keys.includes(input.updatedPost.id),
        )
      )
        return originalDelete.call(ValkeyCache, groups)
      cacheStarted.resolve()
      return cacheRelease.promise.then(() => originalDelete.call(ValkeyCache, groups))
    })
    const originalAdd = entitiesListeners.add
    const queueSpy = vi
      .spyOn(entitiesListeners, 'add')
      .mockImplementation((name, data, options) => {
        if (
          name !== ENTITY_LISTENERS_POST_UPDATED_JOB.name ||
          !(data && typeof data === 'object' && 'id' in data && data.id === input.updatedPost.id)
        )
          return originalAdd.call(entitiesListeners, name, data, options)
        queueStarted.resolve()
        return queueRelease.promise.then(async () => {
          const job = await originalAdd.call(entitiesListeners, name, data, options)
          queueFinished.resolve()
          return job
        })
      })
    onTestFinished(() => {
      cacheSpy.mockRestore()
      queueSpy.mockRestore()
    })
    let completed = false
    await expect(
      drainOwnedTestAction(
        () =>
          finalizePostUpdateAndDeliver(input).then(result => {
            completed = true
            return result
          }),
        () => {
          cacheRelease.resolve()
          queueRelease.resolve()
        },
        async () => {
          await Promise.all([cacheStarted.promise, queueStarted.promise])
          queueRelease.resolve()
          await queueFinished.promise
          expect(completed).toBe(false)
        },
      ),
    ).resolves.toBe(input.updatedPost)
  })

  it('preserves bloom work and suppresses update admission when the captured decision is false', async () => {
    const input = await fixture()
    const originalBloom = entityCacheBloomFilters.posts.addOrThrow
    const bloomCalls: string[][] = []
    const bloomSpy = vi
      .spyOn(entityCacheBloomFilters.posts, 'addOrThrow')
      .mockImplementation(keys => {
        if (!keys.includes(input.updatedPost.slug!))
          return originalBloom.call(entityCacheBloomFilters.posts, keys)
        bloomCalls.push(keys)
        return Promise.resolve()
      })
    const originalAdd = entitiesListeners.add
    const queueCalls: unknown[] = []
    const queueSpy = vi
      .spyOn(entitiesListeners, 'add')
      .mockImplementation((name, data, options) => {
        if (
          name === ENTITY_LISTENERS_POST_UPDATED_JOB.name &&
          data &&
          typeof data === 'object' &&
          'id' in data &&
          data.id === input.updatedPost.id
        )
          queueCalls.push(data)
        return originalAdd.call(entitiesListeners, name, data, options)
      })
    onTestFinished(() => {
      bloomSpy.mockRestore()
      queueSpy.mockRestore()
    })
    await finalizePostUpdateAndDeliver({
      ...input,
      changes: { slug: input.updatedPost.slug! },
      shouldEnqueuePostUpdated: false,
    })
    expect(bloomCalls).toEqual([[input.updatedPost.slug]])
    expect(queueCalls).toEqual([])
  })
})
