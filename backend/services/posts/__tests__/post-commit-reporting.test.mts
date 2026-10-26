import { describe, expect, it, vi } from 'vitest'
import {
  ENTITY_LISTENERS_POST_CREATED_JOB,
  ENTITY_LISTENERS_POST_UPDATED_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { cachePurge } from '@queues/cache-purge/queues'
import { ValkeyCache } from '@data-stores/valkey/cache'
import type onError from '@modules/on-error'
import { caches } from '@services/entity-cache/caches'
import { applyPostCommitSideEffects } from '../create/post-commit-side-effects.mts'
import { finalizePostUpdateAndDeliver } from '../update/post-commit-delivery.mts'
import { createPostCompletionFixture } from '../../../test-helpers/post-commit-completion.mts'
import { postTag } from '@ts-shared/cache'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { invalidate } from '@services/entity-cache/invalidate'

describe('post-commit failure reporting ownership', () => {
  it('retains a real entity admission rejection without reporting it again', async () => {
    const { post } = await createPostCompletionFixture()
    const failure = new Error('Owned entity admission failure')
    const outerReport = vi.fn<typeof onError>()
    const original = entitiesListeners.add
    const spy = vi.spyOn(entitiesListeners, 'add')
    spy.mockImplementation((name, data, options) => {
      if (
        name === ENTITY_LISTENERS_POST_CREATED_JOB.name &&
        data &&
        typeof data === 'object' &&
        'id' in data &&
        data.id === post.id
      )
        return Promise.reject(failure)
      return original.call(entitiesListeners, name, data, options)
    })
    try {
      await expect(
        applyPostCommitSideEffects({ post }, { onError: outerReport }),
      ).resolves.toBeUndefined()
      expect(outerReport).not.toHaveBeenCalled()
      expect(sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure)).toHaveLength(
        1,
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('exposes the default cache deletion failure while preserving the durable update', async () => {
    const { post } = await createPostCompletionFixture()
    const failure = new Error('Owned cache deletion failure')
    const report = vi.fn<typeof onError>()
    const original = ValkeyCache.deleteFromCaches
    const spy = vi.spyOn(ValkeyCache, 'deleteFromCaches')
    spy.mockImplementation(groups => {
      if (
        groups.some(
          group => group.cache === caches.posts && group.keys.some(key => key === post.id),
        )
      )
        return Promise.reject(failure)
      return original.call(ValkeyCache, groups)
    })
    try {
      await expect(
        finalizePostUpdateAndDeliver(
          {
            changes: {},
            contentChanged: false,
            previousPost: post,
            updatedPost: post,
            shouldEnqueuePostUpdated: false,
          },
          { onError: report },
        ),
      ).resolves.toBe(post)
      expect(report).toHaveBeenCalledExactlyOnceWith(failure)
      await expect(invalidate.posts(post)).resolves.toBeUndefined()
      expect(report).toHaveBeenCalledExactlyOnceWith(failure)
      expect(sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure)).toHaveLength(
        1,
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('retains a real update admission rejection and its payload without a second report', async () => {
    const { post } = await createPostCompletionFixture()
    const failure = new Error('Owned update admission failure')
    const outerReport = vi.fn<typeof onError>()
    const original = entitiesListeners.add
    const admittedCalls: { name: string; data: unknown }[] = []
    const spy = vi.spyOn(entitiesListeners, 'add')
    spy.mockImplementation((name, data, options) => {
      if (
        name === ENTITY_LISTENERS_POST_UPDATED_JOB.name &&
        data &&
        typeof data === 'object' &&
        'id' in data &&
        data.id === post.id
      ) {
        admittedCalls.push({ name, data })
        return Promise.reject(failure)
      }
      return original.call(entitiesListeners, name, data, options)
    })
    try {
      await expect(
        finalizePostUpdateAndDeliver(
          {
            changes: {},
            contentChanged: false,
            previousPost: post,
            updatedPost: post,
            shouldEnqueuePostUpdated: true,
          },
          { onError: outerReport },
        ),
      ).resolves.toBe(post)
      expect(admittedCalls).toEqual([
        {
          name: ENTITY_LISTENERS_POST_UPDATED_JOB.name,
          data: { id: post.id, contentChanged: false },
        },
      ])
      expect(outerReport).not.toHaveBeenCalled()
      expect(sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure)).toHaveLength(
        1,
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('retains a default purge admission failure without duplicating its factory report', async () => {
    const { post } = await createPostCompletionFixture()
    const failure = new Error('Owned purge admission failure')
    const outerReport = vi.fn<typeof onError>()
    const original = cachePurge.addBulk
    const spy = vi.spyOn(cachePurge, 'addBulk')
    spy.mockImplementation(jobs => {
      if (
        jobs.some(
          job =>
            typeof job.data === 'object' &&
            job.data &&
            'tags' in job.data &&
            Array.isArray(job.data.tags) &&
            job.data.tags.includes(postTag(post.id)),
        )
      )
        return Promise.reject(failure)
      return original.call(cachePurge, jobs)
    })
    try {
      await expect(
        finalizePostUpdateAndDeliver(
          {
            changes: {},
            contentChanged: false,
            previousPost: post,
            updatedPost: post,
            shouldEnqueuePostUpdated: false,
          },
          { onError: outerReport },
        ),
      ).resolves.toBe(post)
      expect(outerReport).not.toHaveBeenCalled()
      expect(sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure)).toHaveLength(
        1,
      )
      await expect(invalidate.posts(post)).resolves.toBeUndefined()
      expect(sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure)).toHaveLength(
        2,
      )
    } finally {
      spy.mockRestore()
    }
  })
})
