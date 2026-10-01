import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import { getModerationSystemUserId } from '@services/users/system-users'
import {
  createTestUser,
  getCommunityPostReviewAutomodState,
  getCommunityPostReviewStatus,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  setPostLLMModerationContentSha256,
  setTestCommunityPostReviewAutomodFlag,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { setTestCommunityPostReviewPlatformOverride } from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import { flagPostForAutomodReview } from './automod-flag.mts'
import { unpublishPostForAutomodFlag } from './agent-moderate.mts'

async function publishedPost() {
  const author = await createTestUser()
  const community = await insertTestCommunity({ createdById: author.id })
  const postId = await insertTestPost({
    createdById: author.id,
    slug: `automod-effects-${randomUUID()}`,
    title: `Automod effects ${randomUUID()}`,
    markdown: 'A post under community rules.',
    communityId: community.id,
  })
  await insertTestCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: author.id,
  })
  return { author, communityId: community.id, postId, contentSha256: randomBytes(32) }
}

async function reviewHistory(postId: string) {
  const { rows } = await read<{
    action: string
    actor_user_id: string
    platform_override: boolean
  }>(
    sql`/* reviewHistory */
    SELECT action, actor_user_id, platform_override FROM community_post_review_changes
    WHERE post_id = ${postId} ORDER BY id`,
  )
  return rows
}

/** A moderator dismissal, which the schema only allows on a review-queue flag. */
async function dismissFlag(postId: string, dismissedById: string) {
  await write(sql`/* dismissFlag */
    UPDATE community_post_reviews
    SET automod_dismissed_at = now(), automod_dismissed_by_id = ${dismissedById}
    WHERE post_id = ${postId}`)
}

async function removeActionCount(postId: string) {
  const { rows } = await read<{ count: number }>(sql`/* removeActionCount */
    SELECT count(*)::integer AS count FROM moderator_actions
    WHERE post_id = ${postId} AND action_type = 'remove'`)
  return rows[0]!.count
}

describe('flagPostForAutomodReview', () => {
  async function flag(post: Awaited<ReturnType<typeof publishedPost>>) {
    await using query = await beginTransaction()
    const flagged = await flagPostForAutomodReview(query, post)
    await query.commit()
    return flagged
  }

  it('flags a published post for the digest it ran on and keeps it published', async () => {
    const post = await publishedPost()

    await expect(flag(post)).resolves.toBe(true)

    const state = await getCommunityPostReviewAutomodState(post.postId)
    expect(state?.automod_action).toBe('review_queue')
    expect(state?.automod_flagged_content_sha256?.equals(post.contentSha256)).toBe(true)
    expect(await getCommunityPostReviewStatus(post.communityId, post.postId)).toMatchObject({
      unpublished_at: null,
      approved_at: expect.any(Date),
    })
    expect(await reviewHistory(post.postId)).toEqual([])
  })

  it('clears an earlier dismissal when it flags again', async () => {
    const post = await publishedPost()
    const moderator = await createTestUser()
    await flag(post)
    await dismissFlag(post.postId, moderator.id)
    expect((await getCommunityPostReviewAutomodState(post.postId))?.automod_dismissed_at).not.toBe(
      null,
    )

    await expect(flag(post)).resolves.toBe(true)

    expect(await getCommunityPostReviewAutomodState(post.postId)).toMatchObject({
      automod_dismissed_at: null,
      automod_dismissed_by_id: null,
    })
  })

  it('writes nothing when the transaction that owns it rolls back', async () => {
    const post = await publishedPost()
    {
      await using query = await beginTransaction()
      await expect(flagPostForAutomodReview(query, post)).resolves.toBe(true)
      await query.rollback()
    }

    expect((await getCommunityPostReviewAutomodState(post.postId))?.automod_action).toBeNull()
  })

  it.each([
    ['unpublished', { unpublishedAt: new Date() }],
    ['rejected', { approvedAt: null, rejectedAt: new Date() }],
    ['not yet approved', { approvedAt: null }],
  ])('leaves a post that is %s alone', async (_label, change) => {
    const post = await publishedPost()
    await updateTestCommunityPostReviewState({
      communityId: post.communityId,
      postId: post.postId,
      ...change,
    })

    await expect(flag(post)).resolves.toBe(false)

    expect((await getCommunityPostReviewAutomodState(post.postId))?.automod_action).toBeNull()
  })

  it('leaves a post under platform override alone', async () => {
    const post = await publishedPost()
    await setTestCommunityPostReviewPlatformOverride(post.postId, post.author.id)

    await expect(flag(post)).resolves.toBe(false)

    expect((await getCommunityPostReviewAutomodState(post.postId))?.automod_action).toBeNull()
  })
})

describe('unpublishPostForAutomodFlag', () => {
  async function unpublish(post: Awaited<ReturnType<typeof publishedPost>>) {
    const moderationSystemUserId = await getModerationSystemUserId()
    await using query = await beginTransaction()
    const result = await unpublishPostForAutomodFlag(query, { ...post, moderationSystemUserId })
    await query.commit()
    return { result, moderationSystemUserId }
  }

  it('unpublishes as the moderation system user and records the flag with the unpublish', async () => {
    const post = await publishedPost()

    const { result, moderationSystemUserId } = await unpublish(post)

    expect(result).toBe('removed')
    expect(await getCommunityPostReviewStatus(post.communityId, post.postId)).toMatchObject({
      unpublished_at: expect.any(Date),
      unpublished_by_id: moderationSystemUserId,
    })
    const state = await getCommunityPostReviewAutomodState(post.postId)
    expect(state?.automod_action).toBe('unpublish')
    expect(state?.automod_flagged_content_sha256?.equals(post.contentSha256)).toBe(true)
    expect(await reviewHistory(post.postId)).toEqual([
      { action: 'unpublish', actor_user_id: moderationSystemUserId, platform_override: false },
    ])
    expect(await removeActionCount(post.postId)).toBe(1)
  })

  it('reports an already unpublished post without a second history row or audit action', async () => {
    const post = await publishedPost()
    await unpublish(post)

    const { result } = await unpublish(post)

    expect(result).toBe('already-removed')
    expect(await reviewHistory(post.postId)).toHaveLength(1)
    expect(await removeActionCount(post.postId)).toBe(1)
  })

  it('writes nothing when the transaction that owns it rolls back', async () => {
    const post = await publishedPost()
    const moderationSystemUserId = await getModerationSystemUserId()
    {
      await using query = await beginTransaction()
      await expect(
        unpublishPostForAutomodFlag(query, { ...post, moderationSystemUserId }),
      ).resolves.toBe('removed')
      await query.rollback()
    }

    expect(await getCommunityPostReviewStatus(post.communityId, post.postId)).toMatchObject({
      unpublished_at: null,
    })
    expect((await getCommunityPostReviewAutomodState(post.postId))?.automod_action).toBeNull()
    expect(await reviewHistory(post.postId)).toEqual([])
    expect(await removeActionCount(post.postId)).toBe(0)
  })

  it('never unpublishes a post under platform override, and records no flag', async () => {
    const post = await publishedPost()
    await setTestCommunityPostReviewPlatformOverride(post.postId, post.author.id)

    const { result } = await unpublish(post)

    expect(result).not.toBe('removed')
    expect(await getCommunityPostReviewStatus(post.communityId, post.postId)).toMatchObject({
      unpublished_at: null,
    })
    expect((await getCommunityPostReviewAutomodState(post.postId))?.automod_action).toBeNull()
    expect(await reviewHistory(post.postId)).toEqual([])
  })

  it('does not unpublish a rejected post', async () => {
    const post = await publishedPost()
    await updateTestCommunityPostReviewState({
      communityId: post.communityId,
      postId: post.postId,
      approvedAt: null,
      rejectedAt: new Date(),
    })

    const { result } = await unpublish(post)

    expect(result).not.toBe('removed')
    expect(await getCommunityPostReviewStatus(post.communityId, post.postId)).toMatchObject({
      unpublished_at: null,
    })
    expect((await getCommunityPostReviewAutomodState(post.postId))?.automod_action).toBeNull()
  })

  it('replaces an earlier dismissal with the new flag', async () => {
    const post = await publishedPost()
    const moderator = await createTestUser()
    await setPostLLMModerationContentSha256(post.postId, post.contentSha256)
    await setTestCommunityPostReviewAutomodFlag({ postId: post.postId, action: 'review_queue' })
    await dismissFlag(post.postId, moderator.id)

    await unpublish(post)

    expect(await getCommunityPostReviewAutomodState(post.postId)).toMatchObject({
      automod_action: 'unpublish',
      automod_dismissed_at: null,
      automod_dismissed_by_id: null,
    })
  })
})
