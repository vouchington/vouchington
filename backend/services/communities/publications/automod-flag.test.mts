import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'node:crypto'
import {
  createTestUser,
  deleteTestPost,
  getCommunityPostReviewAutomodState,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  setPostLLMModerationContentSha256,
  setTestCommunityPostReviewAutomodFlag,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { dismissCommunityAutomodFlag } from './automod-flag.mts'

describe('dismissCommunityAutomodFlag', () => {
  let author: PrivateUser
  let moderator: PrivateUser
  let otherModerator: PrivateUser

  beforeAll(async () => {
    ;[author, moderator, otherModerator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
  })

  async function createFlaggedPost(action: 'review_queue' | 'unpublish' = 'review_queue') {
    const suffix = crypto.randomUUID().slice(0, 8)
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Automod Flag Community ${suffix}`,
      slug: `automod-flag-comm-${suffix}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `automod-flag-post-${suffix}`,
      title: `Automod Flag Post ${suffix}`,
      markdown: 'body',
      communityId: community.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })
    await setPostLLMModerationContentSha256(postId, crypto.randomBytes(32))
    await setTestCommunityPostReviewAutomodFlag({ postId, action })
    return { communityId: community.id, postId }
  }

  it('records who dismissed the current flag and when', async () => {
    const { communityId, postId } = await createFlaggedPost()

    await dismissCommunityAutomodFlag({ communityId, postId, dismissedById: moderator.id })

    const state = await getCommunityPostReviewAutomodState(postId)
    expect(state).toMatchObject({
      automod_action: 'review_queue',
      automod_dismissed_by_id: moderator.id,
    })
    expect(state!.automod_dismissed_at).toBeInstanceOf(Date)
  })

  it('succeeds again without rewriting the original dismissal', async () => {
    const { communityId, postId } = await createFlaggedPost()
    await dismissCommunityAutomodFlag({ communityId, postId, dismissedById: moderator.id })
    const first = await getCommunityPostReviewAutomodState(postId)

    await dismissCommunityAutomodFlag({ communityId, postId, dismissedById: otherModerator.id })

    expect(await getCommunityPostReviewAutomodState(postId)).toEqual(first)
  })

  it.each([
    ['an unpublish flag', async () => createFlaggedPost('unpublish')],
    [
      'a flag the post content has moved past',
      async () => {
        const flagged = await createFlaggedPost()
        await setPostLLMModerationContentSha256(flagged.postId, crypto.randomBytes(32))
        return flagged
      },
    ],
    [
      'a flag on an unpublished post',
      async () => {
        const flagged = await createFlaggedPost()
        await updateTestCommunityPostReviewState({ ...flagged, unpublishedAt: new Date() })
        return flagged
      },
    ],
    [
      'a flag on a deleted post',
      async () => {
        const flagged = await createFlaggedPost()
        await deleteTestPost(flagged.postId)
        return flagged
      },
    ],
  ])('rejects dismissing %s with a 404 and leaves it untouched', async (_label, setup) => {
    const { communityId, postId } = await setup()
    const before = await getCommunityPostReviewAutomodState(postId)

    await expect(
      dismissCommunityAutomodFlag({ communityId, postId, dismissedById: moderator.id }),
    ).rejects.toMatchObject({ status: 404 })

    expect(await getCommunityPostReviewAutomodState(postId)).toEqual(before)
  })

  it('rejects a post that was never flagged and a post of another community', async () => {
    const flagged = await createFlaggedPost()
    const other = await createFlaggedPost()

    await expect(
      dismissCommunityAutomodFlag({
        communityId: other.communityId,
        postId: flagged.postId,
        dismissedById: moderator.id,
      }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      dismissCommunityAutomodFlag({
        communityId: flagged.communityId,
        postId: crypto.randomUUID(),
        dismissedById: moderator.id,
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(await getCommunityPostReviewAutomodState(flagged.postId)).toMatchObject({
      automod_dismissed_at: null,
    })
  })
})
