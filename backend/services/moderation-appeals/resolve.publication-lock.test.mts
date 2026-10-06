import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  updateTestCommunityPostReviewState,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import * as postPublication from '@services/post-publication'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'
import { resolveModerationAppealAccept } from './resolve.mts'
import { deliverModerationAppealForTest } from '@voucha/test-helpers/services/moderation-appeals/resolution.fixtures'

describe('resolveModerationAppealAccept publication lock', () => {
  it('takes the post publication lock before waiting on a community review row', async () => {
    const [staff, appellant] = await Promise.all([createTestUser(), createTestUser()])
    if (!staff || !appellant) throw new Error('Expected users')
    const suffix = crypto.randomUUID().slice(0, 8)
    const community = await insertTestCommunity({
      name: `Appeal lock ${suffix}`,
      slug: `appeal-lock-${suffix}`,
      createdById: staff.id,
    })
    const postId = await insertTestPost({
      title: `Appeal lock ${suffix}`,
      slug: `appeal-lock-post-${suffix}`,
      createdById: appellant.id,
      markdown: 'Appeal lock test',
      clearanceStatus: 'pending',
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })
    const { appeal } = await createModerationAppeal(
      appellant,
      WEB_PROVENANCE,
      parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'Please reinstate this post.',
      }),
    )
    await deliverModerationAppealForTest(staff.id, appeal.id)

    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    async function holdReviewRow() {
      await using query = await beginTransaction()
      await query(
        `/* resolve appeal publication lock test */
        SELECT 1
        FROM community_post_reviews
        WHERE community_id = $1::uuid AND post_id = $2::uuid
        FOR UPDATE`,
        [community.id, postId],
      )
      rowLocked.resolve()
      await releaseRow.promise
      await query.commit()
    }
    const holder = holdReviewRow()
    await rowLocked.promise

    const publicationLocked = Promise.withResolvers<void>()
    const lockPostPublication = postPublication.lockPostPublication
    vi.spyOn(postPublication, 'lockPostPublication').mockImplementation(async (...args) => {
      await lockPostPublication(...args)
      publicationLocked.resolve()
    })
    const resolving = resolveModerationAppealAccept(staff.id, appeal.id, 'staff_or_user')
    try {
      await publicationLocked.promise
      await expect(probePublicationLock(postId, lockPostPublication)).rejects.toMatchObject({
        code: '55P03',
      })
    } finally {
      releaseRow.resolve()
      vi.restoreAllMocks()
    }
    await holder
    await expect(resolving).resolves.toMatchObject({ status: 'resolved' })
  })
})

async function probePublicationLock(
  postId: string,
  lockPostPublication: typeof postPublication.lockPostPublication,
): Promise<void> {
  await using query = await beginTransaction()
  await query(`/* resolve appeal publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await lockPostPublication(query, postId)
  await query.commit()
}
