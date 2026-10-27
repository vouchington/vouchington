import {
  beginTransaction,
  createTestPost,
  createTestUser,
  insertTestPostStory,
  insertTestStory,
} from '@voucha/test-helpers'
import {
  holdTestUserProfileRow,
  readTestStoryPostInitiator,
  setTestLocalLockTimeout,
} from '../../test-helpers/publication-test-queries.mts'
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
    expect(await readTestStoryPostInitiator(post.id)).toBe(DELETED_USER_ID)
  })

  it('waits for a concurrent profile username update before retaining the tombstone', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')

    await using profileUpdate = await beginTransaction()
    await holdTestUserProfileRow(profileUpdate, user.id)
    await expect(captureAuthorDeletionWithShortTimeout(user.id)).rejects.toMatchObject({
      code: '55P03',
    })
    await profileUpdate.commit()
  })
})

async function captureAuthorDeletionWithShortTimeout(userId: string): Promise<void> {
  await using capture = await beginTransaction()
  await setTestLocalLockTimeout(capture)
  await processAuthorDeletionPublicationBatch(capture, userId, null, 100)
  await capture.commit()
}
