import { lockPostPublication } from '@services/post-publication'
import {
  beginTransaction,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import { unpublishPostAsAgent } from './agent-moderate.mts'
import { unpublishPost } from './moderate.mts'

describe('unpublishPostAsAgent publication locking', () => {
  it('locks the post publication scope before waiting on the review row', async () => {
    expect.hasAssertions()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const postId = await insertTestPost({
      title: 'Agent moderation publication lock',
      slug: `agent-moderation-publication-lock-${crypto.randomUUID()}`,
      markdown: 'Lock ordering regression fixture.',
      createdById: owner.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })

    const reviewLocked = Promise.withResolvers<void>()
    const releaseReview = Promise.withResolvers<void>()
    const holder = holdReviewRowLock()

    async function holdReviewRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* agent moderation publication lock test */
      SELECT 1
      FROM community_post_reviews
      WHERE community_id = $1::uuid AND post_id = $2::uuid
      FOR UPDATE`,
        [community.id, postId],
      )
      reviewLocked.resolve()
      await releaseReview.promise

      await query.commit()
    }
    await reviewLocked.promise

    const unpublishing = unpublishPostAsAgent(community.id, postId)
    try {
      await vi.waitFor(async () => {
        await expect(lockPostPublicationWithTimeout()).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseReview.resolve()
    }
    await holder
    await expect(unpublishing).resolves.toBe('removed')

    async function lockPostPublicationWithTimeout(): Promise<void> {
      await using query = await beginTransaction()
      await query(`SET LOCAL lock_timeout = '50ms'`)
      await lockPostPublication(query, postId)
      await query.commit()
    }
  })

  it('locks the post publication scope before a manual unpublish waits on the review row', async () => {
    expect.hasAssertions()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const postId = await insertTestPost({
      title: 'Manual moderation publication lock',
      slug: `manual-moderation-publication-lock-${crypto.randomUUID()}`,
      markdown: 'Lock ordering regression fixture.',
      createdById: owner.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })

    const reviewLocked = Promise.withResolvers<void>()
    const releaseReview = Promise.withResolvers<void>()
    const holder = holdReviewRowLock()

    async function holdReviewRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* manual moderation publication lock test */
      SELECT 1
      FROM community_post_reviews
      WHERE community_id = $1::uuid AND post_id = $2::uuid
      FOR UPDATE`,
        [community.id, postId],
      )
      reviewLocked.resolve()
      await releaseReview.promise

      await query.commit()
    }
    await reviewLocked.promise

    const unpublishing = unpublishPost(owner, community.id, postId)
    try {
      await vi.waitFor(async () => {
        await expect(lockPostPublicationWithTimeout()).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseReview.resolve()
    }
    await holder
    await expect(unpublishing).resolves.toBeUndefined()

    async function lockPostPublicationWithTimeout(): Promise<void> {
      await using query = await beginTransaction()
      await query(`SET LOCAL lock_timeout = '50ms'`)
      await lockPostPublication(query, postId)
      await query.commit()
    }
  })
})
