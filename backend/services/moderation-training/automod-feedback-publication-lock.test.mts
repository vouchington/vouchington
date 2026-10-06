import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  setTestPostClearanceStatus,
  updatePostModerationData,
} from '@voucha/test-helpers'
import * as postPublication from '@services/post-publication'
import { recordAutomodActionFeedback } from './automod-feedback.mts'

describe('recordAutomodActionFeedback publication lock', () => {
  it('takes the publication lock before waiting on the post row', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `training-publication-lock-${random}`,
    })
    const postId = await insertTestPost({
      title: `Publication lock ${random}`,
      slug: `publication-lock-${random}`,
      createdById: owner.id,
      markdown: `Publication lock ${random}.`,
      communityId: community.id,
    })
    const inputSha256 = Buffer.alloc(32, 7)
    await setTestPostClearanceStatus(postId, 'rejected')
    await updatePostModerationData(postId, inputSha256, [{ flagged: true }], true)
    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    async function holdPostRow() {
      await using query = await beginTransaction()
      await query(
        `/* recordAutomodActionFeedback publication lock test */ SELECT 1 FROM posts WHERE id = $1 FOR UPDATE`,
        [postId],
      )
      rowLocked.resolve()
      await releaseRow.promise
      await query.commit()
    }
    const holder = holdPostRow()
    await rowLocked.promise

    const publicationLocked = Promise.withResolvers<void>()
    const lockPostPublication = postPublication.lockPostPublication
    vi.spyOn(postPublication, 'lockPostPublication').mockImplementation(async (...args) => {
      await lockPostPublication(...args)
      publicationLocked.resolve()
    })
    const feedback = recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: `openai_omni:${postId}:${inputSha256.toString('hex')}`,
      actorUserId: owner.id,
      outcome: 'true_positive',
      action: 'label_only',
    })
    try {
      await publicationLocked.promise
      await expect(
        lockPublicationWithShortTimeout(postId, lockPostPublication),
      ).rejects.toMatchObject({ code: '55P03' })
    } finally {
      releaseRow.resolve()
      vi.restoreAllMocks()
    }
    await holder
    await expect(feedback).resolves.toMatchObject({ applied_action: true })
  })
})

async function lockPublicationWithShortTimeout(
  postId: string,
  lockPostPublication: typeof postPublication.lockPostPublication,
): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* recordAutomodActionFeedback publication lock timeout */ SET LOCAL lock_timeout = '50ms'`,
  )
  await lockPostPublication(query, postId)
  await query.commit()
}
