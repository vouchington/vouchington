import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  insertTestDataPoint,
} from '@voucha/test-helpers'
import { settleTopicMergeOperationForTest } from '@voucha/test-helpers/merge-topics'
import { getPostDataPointTopicIdsForTest } from '@voucha/test-helpers/post-data-point-topics'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { describe, expect, it } from 'vitest'
import { insertPostDataPointTopics } from '../posts/data-point-topics.mts'
import { getTopicByAny } from './get.mts'
import { createTopicMergeOperation } from './merge-operations.mts'

describe('topic merge admission with an in-flight tag', () => {
  it('moves a tag inserted before admission and committed while admission waits', async () => {
    const admin = await createTestUser({ administrator: true })
    const [sourceRow, destinationRow] = await Promise.all([
      createTestTopic({ user: admin }),
      createTestTopic({ user: admin }),
    ])
    const [source, destination] = await Promise.all([
      getTopicByAny(sourceRow.id),
      getTopicByAny(destinationRow.id),
    ])
    const suffix = crypto.randomUUID()
    const postId = await insertTestDataPoint({
      title: `In-flight tag ${suffix}`,
      slug: `in-flight-tag-${suffix}`,
      createdById: admin.id,
    })

    await using writer = await beginTransaction()
    await insertPostDataPointTopics(postId, [sourceRow.id], { query: writer })
    const holderProcessId = await getTestPostgresBackendProcessId(writer)
    let committed: Promise<void> | undefined
    const commitTag = () => (committed ??= writer.commit())

    const [outcome] = await Promise.allSettled([
      withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'mergeTopicAliases lockTopics',
          releaseHolder: commitTag,
        },
        async waitForLock => {
          const merge = (async () => {
            const operation = await createTopicMergeOperation(admin, source!, destination!)
            return settleTopicMergeOperationForTest(admin, sourceRow.id, operation.id)
          })()
          await waitForLock(merge)
          await commitTag()
          return merge
        },
      ),
    ])

    // If admission did not wait, the observer releases the writer after the merge finishes.
    await expect(getPostDataPointTopicIdsForTest(postId)).resolves.toEqual([destinationRow.id])
    if (outcome.status === 'rejected') throw outcome.reason
    expect(outcome.value).toMatchObject({ status: 'completed' })
    await expect(getTopicByAny(sourceRow.id)).resolves.toMatchObject({ id: destinationRow.id })
  })
})
