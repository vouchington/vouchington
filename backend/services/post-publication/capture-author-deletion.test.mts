import {
  beginTransaction,
  createTestPost,
  createTestUser,
  insertTestPostStory,
  insertTestStory,
} from '@voucha/test-helpers'
import { readTestStoryPostInitiator } from '../../test-helpers/publication-test-queries.mts'
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
})
