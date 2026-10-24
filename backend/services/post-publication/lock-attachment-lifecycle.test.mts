import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  countCapturedQueriesByAnnotation,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
  withCapturedTestQueries,
} from '@voucha/test-helpers'
import { lockTopicRssFeedAttachmentLifecycles } from './lock.mts'
import {
  createFailOnceAttachmentFenceQuery,
  lockAttachmentFenceBeforeFollowingStatement,
  lockAttachmentFenceInNestedCallback,
  withRolledBackBorrowedAttachmentFenceScope,
} from '@voucha/test-helpers/post-publication-attachment-fence'

const annotation = 'lockTopicRssFeedAttachmentLifecycles'

describe('topic RSS feed attachment lifecycle fence', () => {
  it('sends one lock statement for repeated topic IDs in the same transaction', async () => {
    const first = randomUUID()
    const second = randomUUID()
    await using query = await beginTransaction()
    const { queries } = await withCapturedTestQueries(async () => {
      await lockTopicRssFeedAttachmentLifecycles(query, [second, first, first.toUpperCase()])
      await lockAttachmentFenceInNestedCallback(query, [second, first])
      await lockTopicRssFeedAttachmentLifecycles(query, [])
    })
    expect(countCapturedQueriesByAnnotation(queries, annotation)).toBe(1)
  })

  it('deduplicates concurrent fence requests on the same query object', async () => {
    const topicId = randomUUID()
    await using query = await beginTransaction()
    const { queries } = await withCapturedTestQueries(() =>
      Promise.all([
        lockTopicRssFeedAttachmentLifecycles(query, [topicId]),
        lockTopicRssFeedAttachmentLifecycles(query, [topicId]),
      ]),
    )
    expect(countCapturedQueriesByAnnotation(queries, annotation)).toBe(1)
  })

  it('preserves a failed acquisition and lets a queued caller acquire the fence', async () => {
    const topicId = randomUUID()
    await using transaction = await beginTransaction()
    const failingQuery = createFailOnceAttachmentFenceQuery(transaction)
    const { result, queries } = await withCapturedTestQueries(() =>
      Promise.allSettled([
        lockTopicRssFeedAttachmentLifecycles(failingQuery, [topicId]),
        lockTopicRssFeedAttachmentLifecycles(failingQuery, [topicId]),
      ]),
    )
    expect(result[0]).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ message: 'Injected attachment fence query failure' }),
    })
    expect(result[1]).toEqual({ status: 'fulfilled', value: undefined })
    expect(countCapturedQueriesByAnnotation(queries, annotation)).toBe(1)
  })

  it('submits the first fence before a following statement on the same query', async () => {
    await using query = await beginTransaction()
    const { queries } = await withCapturedTestQueries(() =>
      lockAttachmentFenceBeforeFollowingStatement(query, randomUUID()),
    )
    const order = queries.flatMap(({ text }) => {
      if (text.includes(`/* ${annotation} */`)) return ['fence']
      if (text.includes('/* attachmentFenceFollowingStatement */')) return ['following']
      return []
    })
    expect(order).toEqual(['fence', 'following'])
  })

  it('makes a different transaction wait for the held topic fence', async () => {
    const topicId = randomUUID()
    await using holder = await beginTransaction()
    await using waiter = await beginTransaction()
    await lockTopicRssFeedAttachmentLifecycles(holder, [topicId])
    const holderPid = await getTestPostgresBackendProcessId(holder)
    const waiterLock = lockTopicRssFeedAttachmentLifecycles(waiter, [topicId])
    try {
      await expect(waitForTestPostgresLockWaiter(holderPid, annotation)).resolves.toBeUndefined()
    } finally {
      await holder.commit()
    }
    await waiterLock
    await waiter.commit()
  })

  it('re-fences in a fresh borrowed scope after a real savepoint rollback', async () => {
    const topicId = randomUUID()
    await withRolledBackBorrowedAttachmentFenceScope(
      query => lockTopicRssFeedAttachmentLifecycles(query, [topicId]),
      async runBorrowed => {
        await using holder = await beginTransaction()
        await lockTopicRssFeedAttachmentLifecycles(holder, [topicId])
        const holderPid = await getTestPostgresBackendProcessId(holder)
        const borrowedLock = runBorrowed(query =>
          lockTopicRssFeedAttachmentLifecycles(query, [topicId]),
        )
        try {
          await expect(
            waitForTestPostgresLockWaiter(holderPid, annotation),
          ).resolves.toBeUndefined()
        } finally {
          await holder.commit()
        }
        await borrowedLock
      },
    )
  })
})
