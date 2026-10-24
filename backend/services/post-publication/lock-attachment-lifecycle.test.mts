import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  countCapturedQueriesByAnnotation,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
  withCapturedTestQueries,
} from '@voucha/test-helpers'
import { withTransactionOptions } from '@data-stores/psql'
import { lockTopicRssFeedAttachmentLifecycles } from './lock.mts'
import {
  createFailOnceAttachmentFenceQuery,
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
      await withTransactionOptions({ query }, nested =>
        lockTopicRssFeedAttachmentLifecycles(nested, [second, first]),
      )
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

  it('does not treat a failed lock statement as held', async () => {
    const topicId = randomUUID()
    await using transaction = await beginTransaction()
    const failingQuery = createFailOnceAttachmentFenceQuery(transaction)
    await expect(lockTopicRssFeedAttachmentLifecycles(failingQuery, [topicId])).rejects.toThrow(
      'Injected attachment fence query failure',
    )
    const { queries } = await withCapturedTestQueries(() =>
      lockTopicRssFeedAttachmentLifecycles(failingQuery, [topicId]),
    )
    expect(countCapturedQueriesByAnnotation(queries, annotation)).toBe(1)
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
