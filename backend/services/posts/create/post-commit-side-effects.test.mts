import { describe, expect, it, vi, onTestFinished, type MockInstance } from 'vitest'
import type { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import type onError from '@modules/on-error'
import * as purgeEnqueues from '@queues/cache-purge/enqueues'
import { postTag } from '@ts-shared/cache'
import { invalidate } from '@services/entity-cache/invalidate'
import { applyPostCommitSideEffects } from './post-commit-side-effects.mts'
import {
  createPostCompletionFixture,
  drainOwnedTestAction,
} from '../../../test-helpers/post-commit-completion.mts'

async function fixture() {
  const { creator, post } = await createPostCompletionFixture()
  return { creator, post, postType: 'discussion' as const, updates: {} }
}

describe('applyPostCommitSideEffects', () => {
  it('dispatches the post-created listeners once after commit', async () => {
    const input = await fixture()
    const enqueuePostCreated = vi.fn<typeof enqueueOnPostCreated>(() => Promise.resolve())
    await applyPostCommitSideEffects(input, { enqueueOnPostCreated: enqueuePostCreated })
    expect(enqueuePostCreated).toHaveBeenCalledOnce()
    expect(enqueuePostCreated).toHaveBeenCalledWith(input.post.id)
  })

  it('settles both started bloom and listener operations before returning', async () => {
    const input = await fixture()
    const bloom = Promise.withResolvers<void>()
    const enqueue = Promise.withResolvers<void>()
    const starts: string[] = []
    const operation = () =>
      applyPostCommitSideEffects(input, {
        addEntityBloomKeys: () => {
          starts.push('bloom')
          return bloom.promise
        },
        enqueueOnPostCreated: () => {
          starts.push('enqueue')
          return enqueue.promise
        },
      })
    await drainOwnedTestAction(
      operation,
      () => {
        bloom.resolve()
        enqueue.resolve()
      },
      async () => {
        expect(starts).toEqual(['bloom', 'enqueue'])
      },
    )
  })

  it('drains started bloom work after a synchronous admission failure', async () => {
    const input = await fixture()
    const bloom = Promise.withResolvers<void>()
    const error = new Error('admission failed')
    const report = vi.fn<typeof onError>()
    const operation = () =>
      applyPostCommitSideEffects(input, {
        addEntityBloomKeys: () => bloom.promise,
        enqueueOnPostCreated: () => {
          throw error
        },
        onError: report,
      })
    await drainOwnedTestAction(
      operation,
      () => bloom.resolve(),
      async () => {
        expect(report).not.toHaveBeenCalled()
      },
    )
    expect(report).toHaveBeenCalledExactlyOnceWith(error)
  })

  it('does not reject the committed result when error reporting throws', async () => {
    const input = await fixture()
    const reporterError = new Error('reporter failed')
    const report = vi.fn<typeof onError>(() => {
      throw reporterError
    })
    await expect(
      applyPostCommitSideEffects(input, {
        addEntityBloomKeys: () => {
          const failure = Promise.withResolvers<void>()
          failure.reject(undefined)
          return failure.promise
        },
        enqueueOnPostCreated: () => Promise.resolve(),
        onError: report,
      }),
    ).resolves.toBeUndefined()
    expect(report).toHaveBeenCalledOnce()
    const reported = report.mock.calls[0]?.[0]
    expect(reported).toBeInstanceOf(Error)
    expect(reported).toMatchObject({ message: 'Post-commit effect failed', cause: undefined })
  })

  it('includes owned purge-tag admission in post cache invalidation completion', async () => {
    const input = await fixture()
    const admitted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const original = purgeEnqueues.enqueueBulkPurgeCacheTags
    let spy: MockInstance<typeof purgeEnqueues.enqueueBulkPurgeCacheTags> | undefined
    let operation: Promise<void> | undefined
    let failed = false
    let primary: unknown
    let closed = false
    const errors: unknown[] = []
    let cleanup: Promise<void> | undefined
    const finish = () =>
      (cleanup ??= (async () => {
        release.resolve()
        const settled = await Promise.allSettled(operation ? [operation] : [])
        errors.push(
          ...settled.flatMap(result => (result.status === 'rejected' ? [result.reason] : [])),
        )
        try {
          spy?.mockRestore()
        } catch (err) {
          errors.push(err)
        }
      })())
    onTestFinished(async () => {
      closed = true
      await finish()
      if (errors.length) throw new AggregateError(errors, 'Purge admission teardown failed')
    })
    try {
      spy = vi.spyOn(purgeEnqueues, 'enqueueBulkPurgeCacheTags')
      spy.mockImplementation((tags, priority) => {
        if (!tags.includes(postTag(input.post.id))) return original(tags, priority)
        admitted.resolve()
        return release.promise
      })
      await drainOwnedTestAction(
        () => {
          operation = invalidate.posts(input.post)
          return operation
        },
        () => release.resolve(),
        async () => {
          await Promise.race([
            admitted.promise,
            operation!.then(() => {
              throw new Error('Owned invalidation completed without purge admission')
            }),
          ])
          if (closed) throw new Error('Purge assertion resumed after teardown')
          expect(spy).toHaveBeenCalledWith(expect.arrayContaining([postTag(input.post.id)]))
        },
      )
    } catch (err) {
      failed = true
      primary = err
    } finally {
      await finish()
    }
    if (errors.length)
      throw new AggregateError(
        failed ? [primary, ...errors] : errors,
        'Purge admission cleanup failed',
        { cause: failed ? primary : errors[0] },
      )
    if (failed) {
      const failure = Promise.withResolvers<void>()
      failure.reject(primary)
      return failure.promise
    }
  })
})
