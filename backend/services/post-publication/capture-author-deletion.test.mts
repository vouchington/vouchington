import {
  beginTransaction,
  createTestPost,
  createTestUser,
  insertTestPostStory,
  insertTestStory,
} from '@voucha/test-helpers'
import { read } from '@data-stores/psql'
import { DELETED_USER_ID } from '@voucha/types/entities/user-constants'
import { describe, expect, it } from 'vitest'
import { processAuthorDeletionPublicationBatch } from './capture-author-deletion-batch.mts'

describe('processAuthorDeletionPublicationBatch', () => {
  it('captures and reassigns initiated story links in a bounded page', async () => {
    const initiator = await createTestUser()
    if (!initiator) throw new Error('Expected initiator')
    const post = await createTestPost()
    const story = await insertTestStory()
    await insertTestPostStory(post.id, story.id, initiator.id)

    await using transaction = await beginTransaction()
    const first = await processAuthorDeletionPublicationBatch(transaction, initiator.id, null, 1)
    await transaction.commit()

    expect(first).toEqual({ processed: 1, hasMore: true })
    const { rows } = await read<{ initiated_by_id: string }>(
      `/* captureAuthorDeletionTest:storyLink */
      SELECT initiated_by_id FROM story_posts WHERE post_id = $1::uuid`,
      [post.id],
    )
    expect(rows[0]?.initiated_by_id).toBe(DELETED_USER_ID)
  })

  it('waits for a concurrent profile username update before retaining the tombstone', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')

    await using profileUpdate = await beginTransaction()
    await profileUpdate(
      `/* update profile username */ UPDATE users SET username = username WHERE id = $1`,
      [user.id],
    )
    await expect(captureAuthorDeletionWithShortTimeout(user.id)).rejects.toMatchObject({
      code: '55P03',
    })
    await profileUpdate.commit()
  })
})

async function captureAuthorDeletionWithShortTimeout(userId: string): Promise<void> {
  await using capture = await beginTransaction()
  await capture(`/* author deletion username lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await processAuthorDeletionPublicationBatch(capture, userId, null, 100)
  await capture.commit()
}
