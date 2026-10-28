import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  getEntityRelation,
  hardDeleteTestPost,
  insertEntityRelation,
  insertTestPost,
  insertTestTopic,
  startPausedTestPostTopicRelationWriter,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'

describe('hardDeleteTestPost', () => {
  it('queues behind the post scope lock instead of locking the post row ahead of a live writer', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `Hard delete lock order ${randomUUID()}`,
      slug: `hard-delete-lock-order-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const topicId = await insertTestTopic({
      name: `Hard delete lock order ${randomUUID()}`,
      slug: `hard-delete-lock-order-${randomUUID()}`,
      createdById: creator.id,
    })
    const relationTable = 'relation__post__category__topic'
    await insertEntityRelation(relationTable, postId, topicId)
    const [relation] = await getEntityRelation(relationTable, postId, topicId)
    const writer = await startPausedTestPostTopicRelationWriter(
      postId,
      (relation as { id: string }).id,
    )

    await withTestOwnedPostgresWait(
      {
        holderProcessId: writer.holderProcessId,
        pool: 'write',
        lock: { kind: 'advisory', key: `post:${postId}` },
        queryMarker: 'lockPostPublicationCaptures',
        releaseHolder: writer.complete,
      },
      async waitForLock => {
        const deletion = hardDeleteTestPost(postId)
        await waitForLock(deletion)
        await writer.complete()
        await deletion
      },
    )

    await expect(getEntityRelation(relationTable, postId, topicId)).resolves.toEqual([])
  })
})
