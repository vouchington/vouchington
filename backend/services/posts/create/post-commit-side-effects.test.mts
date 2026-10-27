import { WEB_PROVENANCE } from '@voucha/test-helpers'
import { createPost } from '../create-post.mts'
import { describe, expect, it, vi, onTestFinished } from 'vitest'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { cachePurge } from '@queues/cache-purge/queues'
import { ENTITY_LISTENERS_POST_CREATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { entityCacheBloomFilters } from '@services/entity-cache/bloom-filter-instances'
import { postTag } from '@ts-shared/cache'
import { invalidate } from '@services/entity-cache/invalidate'
import { applyPostCommitSideEffects } from './post-commit-side-effects.mts'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  createPostCompletionFixture,
  drainOwnedTestAction,
} from '../../../test-helpers/post-commit-completion.mts'

async function fixture() {
  const { post } = await createPostCompletionFixture()
  return { post }
}

describe('applyPostCommitSideEffects', () => {
  it.each([true, false])('dispatches post-created listeners with hasSlug=%s', async hasSlug => {
    const owned = await createPostCompletionFixture()
    const post = hasSlug
      ? owned.post
      : await createPost(owned.creator, WEB_PROVENANCE, {
          post_type: 'comment',
          parent_post_id: owned.post.id,
          markdown: 'Owned untitled comment',
        })
    expect(Boolean(post.slug)).toBe(hasSlug)
    const input = { post }
    const original = entitiesListeners.add
    const calls: unknown[] = []
    const spy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
      if (
        name === ENTITY_LISTENERS_POST_CREATED_JOB.name &&
        data &&
        typeof data === 'object' &&
        'id' in data &&
        data.id === input.post.id
      )
        calls.push(data)
      return original.call(entitiesListeners, name, data, options)
    })
    onTestFinished(() => spy.mockRestore())
    await applyPostCommitSideEffects(input)
    expect(calls).toEqual([{ id: input.post.id }])
  })

  it('settles both started bloom and listener operations before returning', async () => {
    const input = await fixture()
    const bloomStarted = Promise.withResolvers<void>()
    const enqueueStarted = Promise.withResolvers<void>()
    const bloomRelease = Promise.withResolvers<void>()
    const enqueueRelease = Promise.withResolvers<void>()
    const bloomFinished = Promise.withResolvers<void>()
    const originalBloom = entityCacheBloomFilters.posts.addOrThrow
    const bloomSpy = vi
      .spyOn(entityCacheBloomFilters.posts, 'addOrThrow')
      .mockImplementation(keys => {
        if (!keys.includes(input.post.id))
          return originalBloom.call(entityCacheBloomFilters.posts, keys)
        bloomStarted.resolve()
        return bloomRelease.promise.then(() => {
          bloomFinished.resolve()
          return undefined
        })
      })
    const originalAdd = entitiesListeners.add
    const enqueueSpy = vi
      .spyOn(entitiesListeners, 'add')
      .mockImplementation((name, data, options) => {
        if (
          name !== ENTITY_LISTENERS_POST_CREATED_JOB.name ||
          !(data && typeof data === 'object' && 'id' in data && data.id === input.post.id)
        )
          return originalAdd.call(entitiesListeners, name, data, options)
        enqueueStarted.resolve()
        return enqueueRelease.promise.then(() =>
          originalAdd.call(entitiesListeners, name, data, options),
        )
      })
    onTestFinished(() => {
      bloomSpy.mockRestore()
      enqueueSpy.mockRestore()
    })
    let completed = false
    await drainOwnedTestAction(
      () =>
        applyPostCommitSideEffects(input).then(() => {
          completed = true
          return undefined
        }),
      () => {
        bloomRelease.resolve()
        enqueueRelease.resolve()
      },
      async () => {
        await Promise.all([bloomStarted.promise, enqueueStarted.promise])
        bloomRelease.resolve()
        await bloomFinished.promise
        expect(completed).toBe(false)
      },
    )
    expect(completed).toBe(true)
  })

  it('drains started bloom work after a synchronous provider admission failure', async () => {
    const input = await fixture()
    const bloom = Promise.withResolvers<void>()
    const failed = Promise.withResolvers<void>()
    const error = new Error('Owned admission failed')
    const originalBloom = entityCacheBloomFilters.posts.addOrThrow
    const bloomSpy = vi
      .spyOn(entityCacheBloomFilters.posts, 'addOrThrow')
      .mockImplementation(keys =>
        keys.includes(input.post.id)
          ? bloom.promise
          : originalBloom.call(entityCacheBloomFilters.posts, keys),
      )
    const originalAdd = entitiesListeners.add
    const enqueueSpy = vi
      .spyOn(entitiesListeners, 'add')
      .mockImplementation((name, data, options) => {
        if (
          name !== ENTITY_LISTENERS_POST_CREATED_JOB.name ||
          !(data && typeof data === 'object' && 'id' in data && data.id === input.post.id)
        )
          return originalAdd.call(entitiesListeners, name, data, options)
        failed.resolve()
        throw error
      })
    onTestFinished(() => {
      bloomSpy.mockRestore()
      enqueueSpy.mockRestore()
    })
    let completed = false
    await drainOwnedTestAction(
      () =>
        applyPostCommitSideEffects(input).then(() => {
          completed = true
          return undefined
        }),
      () => bloom.resolve(),
      async () => {
        await failed.promise
        expect(completed).toBe(false)
      },
    )
    expect(sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === error)).toHaveLength(1)
  })

  it('includes owned purge-tag admission in post cache invalidation completion', async () => {
    const input = await fixture()
    const admitted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const originalAdd = cachePurge.addBulk
    const spy = vi.spyOn(cachePurge, 'addBulk').mockImplementation(jobs => {
      if (
        !jobs.some(
          job =>
            job.data &&
            typeof job.data === 'object' &&
            'tags' in job.data &&
            Array.isArray(job.data.tags) &&
            job.data.tags.includes(postTag(input.post.id)),
        )
      )
        return originalAdd.call(cachePurge, jobs)
      admitted.resolve()
      return release.promise.then(() => originalAdd.call(cachePurge, jobs))
    })
    onTestFinished(() => spy.mockRestore())
    let completed = false
    await drainOwnedTestAction(
      () =>
        invalidate.posts(input.post).then(() => {
          completed = true
          return undefined
        }),
      () => release.resolve(),
      async () => {
        await admitted.promise
        expect(completed).toBe(false)
      },
    )
    expect(completed).toBe(true)
  })
})
