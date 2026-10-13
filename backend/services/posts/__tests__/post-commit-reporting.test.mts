import { describe, expect, it, vi } from 'vitest'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { cachePurge } from '@queues/cache-purge/queues'
import { ValkeyCache } from '@data-stores/valkey/cache'
import type onError from '@modules/on-error'
import { caches } from '@services/entity-cache/caches'
import { applyPostCommitSideEffects } from '../create/post-commit-side-effects.mts'
import { finalizePostUpdateAndDeliver } from '../update/post-commit-delivery.mts'
import { createPostCompletionFixture } from '../../../test-helpers/post-commit-completion.mts'
import { withPostCommitFailureObservation } from '../../../test-helpers/post-commit-failures.mts'
import { postTag } from '@ts-shared/cache'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { invalidate } from '@services/entity-cache/invalidate'

describe('post-commit failure reporting ownership', () => {
  it('retains a real entity admission rejection without reporting it again', async () => {
    const { creator, post } = await createPostCompletionFixture()
    const failure = new Error('Owned entity admission failure')
    const outerReport = vi.fn<typeof onError>()
    const original = entitiesListeners.add
    await withPostCommitFailureObservation(
      post.id,
      restore => {
        const spy = vi.spyOn(entitiesListeners, 'add')
        restore(() => spy.mockRestore())
        spy.mockImplementation((name, data, options) => {
          if (
            name === 'processPostCreated' &&
            data &&
            typeof data === 'object' &&
            'id' in data &&
            data.id === post.id
          )
            return Promise.reject(failure)
          return original.call(entitiesListeners, name, data, options)
        })
      },
      () =>
        applyPostCommitSideEffects(
          { creator, post, postType: 'discussion', updates: {} },
          { onError: outerReport },
        ),
      async (_, events) => {
        expect(events).toHaveLength(1)
        expect((await events[0]!.completion).operations[1]).toEqual({
          status: 'rejected',
          reason: failure,
        })
        expect(outerReport).not.toHaveBeenCalled()
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure),
        ).toHaveLength(1)
      },
    )
  })

  it('exposes the default cache deletion failure while preserving the durable update', async () => {
    const { post } = await createPostCompletionFixture()
    const failure = new Error('Owned cache deletion failure')
    const report = vi.fn<typeof onError>()
    const original = ValkeyCache.deleteFromCaches
    await withPostCommitFailureObservation(
      post.id,
      restore => {
        const spy = vi.spyOn(ValkeyCache, 'deleteFromCaches')
        restore(() => spy.mockRestore())
        spy.mockImplementation(groups => {
          if (
            groups.some(
              group => group.cache === caches.posts && group.keys.some(key => key === post.id),
            )
          )
            return Promise.reject(failure)
          return original.call(ValkeyCache, groups)
        })
      },
      () =>
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
      async (result, events) => {
        expect(result).toBe(post)
        expect(events).toHaveLength(1)
        expect((await events[0]!.completion).operations).toEqual([
          { status: 'rejected', reason: failure },
        ])
        expect(report).toHaveBeenCalledExactlyOnceWith(failure)
      },
    )
  })

  it('retains a default purge admission failure without duplicating its factory report', async () => {
    const { post } = await createPostCompletionFixture()
    const failure = new Error('Owned purge admission failure')
    const outerReport = vi.fn<typeof onError>()
    const original = cachePurge.addBulk
    await withPostCommitFailureObservation(
      post.id,
      restore => {
        const spy = vi.spyOn(cachePurge, 'addBulk')
        restore(() => spy.mockRestore())
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
      },
      () =>
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
      async (result, events, run) => {
        expect(result).toBe(post)
        expect(events).toHaveLength(1)
        expect((await events[0]!.completion).operations).toEqual([
          { status: 'rejected', reason: failure },
        ])
        expect(outerReport).not.toHaveBeenCalled()
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure),
        ).toHaveLength(1)
        await expect(run(() => invalidate.posts(post))).resolves.toBeUndefined()
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === failure),
        ).toHaveLength(2)
      },
    )
  })
})
