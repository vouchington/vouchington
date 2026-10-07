import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followUser,
  getFollowerDistributionFailureForTest,
  getFollowerDistributionFailureReasonsForTest,
  getManualSendNotificationRowsForTest,
  getPostShareRecipientIdsForTest,
  getRssFeedItemShareRecipientIdsForTest,
  markFollowerDistributionFailedForTest,
  markUserFollowDeletedBeforeNowForTest,
  setPostBroadcastForTest,
  setPostDeletedForTest,
  softDeleteRssFeedItemsForTest,
  softDeleteUser,
} from '@voucha/test-helpers'
import {
  sendPostToFollowers,
  sendRssFeedItemToFollowers,
  sharePostWithFollowers,
  shareRssFeedItemWithFollowers,
} from '../create.mts'
import { processFollowerDistributionChunk } from '../process.mts'
import { streamIncompleteFollowerDistributionIdBatches } from '../backfill.mts'

import {
  assertDistributablePost,
  getPostRouteSlug,
  getPostSendTitle,
  truncateText,
  type DistributionPost,
} from '../shared.mts'

describe('processFollowerDistributionChunk', () => {
  it('marks a distribution failed when the post is no longer distributable', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)

    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)
    await setPostDeletedForTest(post.id)

    const result = await processFollowerDistributionChunk(distribution.distribution_id)

    expect(result).toMatchObject({ completed: true, processed: 0 })

    expect(await getFollowerDistributionFailureForTest(distribution.distribution_id)).toMatchObject(
      {
        failed: true,
        failure_reason: 'Post not found',
      },
    )
  })

  it('marks a post share distribution failed when visibility changes before processing', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)

    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)
    await setPostBroadcastForTest(post.id, 'followers')

    const result = await processFollowerDistributionChunk(distribution.distribution_id)

    expect(result).toMatchObject({ completed: true, processed: 0 })
    expect(
      (await getFollowerDistributionFailureForTest(distribution.distribution_id))?.failure_reason,
    ).toBe('Only broadly visible posts can be shared')
  })

  it('prevents redistributing when a recent target row exists', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)
    await processFollowerDistributionChunk(distribution.distribution_id)
    await markFollowerDistributionFailedForTest(distribution.distribution_id)

    await expect(sharePostWithFollowers(sender, post.id)).rejects.toThrow(
      'You can only share this once per day',
    )
  })

  it.each(['post_share', 'post_send', 'rss_feed_item_share', 'rss_feed_item_send'] as const)(
    'blocks a failed %s distribution after at least one recipient was delivered',
    async action => {
      const sender = await createTestUser()
      const creator = await createTestUser()
      const follower = await createTestUser()
      await followUser(follower, sender)

      let distributionId: string
      let retry: () => Promise<unknown>
      if (action === 'post_share' || action === 'post_send') {
        const post = await createTestPost({ user: creator, privacy: 'public' })
        const distribution =
          action === 'post_share'
            ? await sharePostWithFollowers(sender, post.id)
            : await sendPostToFollowers(sender, post.id, { audience: 'all_followers' })
        distributionId = distribution.distribution_id
        retry = () =>
          action === 'post_share'
            ? sharePostWithFollowers(sender, post.id)
            : sendPostToFollowers(sender, post.id, { audience: 'all_followers' })
      } else {
        const topic = await createTestTopic()
        const feedId = await createTestRssFeedWithTiming(topic.id)
        const item = await createTestRssFeedItemWithUrl(feedId)
        const distribution =
          action === 'rss_feed_item_share'
            ? await shareRssFeedItemWithFollowers(sender, item.id)
            : await sendRssFeedItemToFollowers(sender, item.id, { audience: 'all_followers' })
        distributionId = distribution.distribution_id
        retry = () =>
          action === 'rss_feed_item_share'
            ? shareRssFeedItemWithFollowers(sender, item.id)
            : sendRssFeedItemToFollowers(sender, item.id, { audience: 'all_followers' })
      }

      await expect(processFollowerDistributionChunk(distributionId)).resolves.toMatchObject({
        processed: 1,
      })
      await markFollowerDistributionFailedForTest(distributionId)

      await expect(retry()).rejects.toThrow(/You can only (share|send) this once per day/)
    },
  )

  it('allows retrying a failed distribution that delivered to no recipients', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)
    await markFollowerDistributionFailedForTest(distribution.distribution_id)

    await expect(sharePostWithFollowers(sender, post.id)).resolves.toMatchObject({
      status: 'accepted',
    })
  })

  it('completes a distribution with no matching recipients', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)

    const result = await processFollowerDistributionChunk(distribution.distribution_id)
    const secondResult = await processFollowerDistributionChunk(distribution.distribution_id)

    expect(result).toMatchObject({ completed: true, processed: 0 })
    expect(secondResult).toMatchObject({ completed: true, processed: 0 })

    const newFollower = await createTestUser()
    await followUser(newFollower, sender)
    expect((await sharePostWithFollowers(sender, post.id)).status).toBe('accepted')
  })

  it('delivers to selected recipients who unfollow after acceptance', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: [follower.id],
    })
    await markUserFollowDeletedBeforeNowForTest({
      followerId: follower.id,
      followingId: sender.id,
    })

    const result = await processFollowerDistributionChunk(distribution.distribution_id)
    expect(result).toMatchObject({ completed: true, processed: 1 })
    expect(
      await getManualSendNotificationRowsForTest({
        sentByUserId: sender.id,
        postId: post.id,
      }),
    ).toEqual([{ user_id: follower.id, title: expect.any(String) }])
  })

  it('retries a partly delivered selected chunk without duplicate sends', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const followers = await Promise.all([createTestUser(), createTestUser()])
    for (const follower of followers) await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: followers.map(follower => follower.id),
    })

    const first = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 1,
      deferCursorUpdate: true,
    })
    const retry = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 1,
      deferCursorUpdate: true,
    })

    expect(first.processed).toBe(1)
    expect(retry.notificationsToDeliver).toEqual(first.notificationsToDeliver)
    expect(
      await getManualSendNotificationRowsForTest({
        sentByUserId: sender.id,
        postId: post.id,
      }),
    ).toHaveLength(1)
  })

  it('does not include followers who refollow after distribution creation', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)
    await markUserFollowDeletedBeforeNowForTest({
      followerId: follower.id,
      followingId: sender.id,
    })

    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)
    await followUser(follower, sender)

    const result = await processFollowerDistributionChunk(distribution.distribution_id)

    expect(result).toMatchObject({ completed: true, processed: 0 })
  })

  it('marks a post send distribution failed when visibility changes before processing', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)

    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, { audience: 'all_followers' })
    await setPostBroadcastForTest(post.id, 'followers')

    const result = await processFollowerDistributionChunk(distribution.distribution_id)

    expect(result).toMatchObject({ completed: true, processed: 0 })
    expect(
      (await getFollowerDistributionFailureForTest(distribution.distribution_id))?.failure_reason,
    ).toBe('Only broadly visible posts can be sent')
  })

  it('streams incomplete distribution id batches for backfill', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)

    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)

    const streamedIds = new Set<string>()
    for await (const batch of streamIncompleteFollowerDistributionIdBatches()) {
      for (const id of batch) streamedIds.add(id)
      if (streamedIds.has(distribution.distribution_id)) break
    }

    expect(streamedIds).toContain(distribution.distribution_id)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof randomUUID)
  void (0 as unknown as typeof createTestRssFeedItemWithUrl)
  void (0 as unknown as typeof createTestRssFeedWithTiming)
  void (0 as unknown as typeof createTestTopic)
  void (0 as unknown as typeof getFollowerDistributionFailureReasonsForTest)
  void (0 as unknown as typeof getManualSendNotificationRowsForTest)
  void (0 as unknown as typeof getPostShareRecipientIdsForTest)
  void (0 as unknown as typeof getRssFeedItemShareRecipientIdsForTest)
  void (0 as unknown as typeof softDeleteRssFeedItemsForTest)
  void (0 as unknown as typeof softDeleteUser)
  void (0 as unknown as typeof sendRssFeedItemToFollowers)
  void (0 as unknown as typeof shareRssFeedItemWithFollowers)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof assertDistributablePost)
  void (0 as unknown as typeof getPostRouteSlug)
  void (0 as unknown as typeof getPostSendTitle)
  void (0 as unknown as typeof truncateText)
  const keepDistributionPost: DistributionPost | null = null
  void (0 as unknown as typeof keepDistributionPost)
})
