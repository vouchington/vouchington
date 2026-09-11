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
  getPostShareRowsForTest,
  getRssFeedItemShareRecipientIdsForTest,
  markFollowerDistributionFailedForTest,
  markUserFollowDeletedBeforeNowForTest,
  setPostBroadcastForTest,
  setPostDeletedForTest,
  insertTestPost,
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
  it('handles post distribution helper branches', () => {
    const post = {
      id: 'post-1',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      created_by_id: 'creator-1',
      post_type: 'discussion',
      privacy: 'public',
      broadcast: 'everyone',
      slug: 'post-1',
      title: 'A long title',
      markdown: 'Body',
    } satisfies DistributionPost

    expect(() =>
      assertDistributablePost({ ...post, created_by_id: 'user-1' }, 'user-1', 'share'),
    ).toThrow('You cannot share your own post')
    expect(() =>
      assertDistributablePost({ ...post, post_type: 'comment' }, 'user-1', 'send'),
    ).toThrow('Comments cannot be sent')
    expect(() =>
      assertDistributablePost({ ...post, privacy: 'private' }, 'user-1', 'share'),
    ).toThrow('Only public posts can be shared')
    expect(() =>
      assertDistributablePost({ ...post, broadcast: 'followers' }, 'user-1', 'send'),
    ).toThrow('Only broadly visible posts can be sent')
    expect(getPostRouteSlug('data_point')).toBe('data-points')
    expect(getPostRouteSlug('review')).toBe('reviews')
    expect(getPostRouteSlug('link')).toBe('link')
    expect(getPostRouteSlug('article')).toBe('articles')
    expect(getPostSendTitle(null, 'data_point')).toBe('Someone sent you a data point')
    expect(truncateText('abcdef', 5)).toBe('ab...')
  })

  it('processes all followers across queued chunks without including later followers', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const followers = await Promise.all([createTestUser(), createTestUser(), createTestUser()])

    for (const follower of followers) {
      await followUser(follower!, sender)
    }

    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)
    const laterFollower = await createTestUser()
    await followUser(laterFollower, sender)

    const firstChunk = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 2,
    })
    const secondChunk = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 2,
    })

    expect(firstChunk).toMatchObject({ completed: false, processed: 2 })
    expect(secondChunk).toMatchObject({ completed: true, processed: 1 })

    const recipientIds = await getPostShareRecipientIdsForTest({
      sharedByUserId: sender.id,
      postId: post.id,
    })

    expect(recipientIds).toEqual(followers.map(follower => follower!.id).toSorted())
    expect(recipientIds).not.toContain(laterFollower.id)
  })

  it('stores post share sort_at from the later of share time and post creation time', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)

    const postCreatedAt = new Date(Date.now() + 60 * 60 * 1000)
    const postId = await insertTestPost({
      title: `Future share sort ${randomUUID()}`,
      slug: `future-share-sort-${randomUUID()}`,
      markdown: 'Future post body',
      createdById: creator.id,
      privacy: 'public',
      createdAt: postCreatedAt,
    })

    const distribution = await sharePostWithFollowers(sender, postId)
    await processFollowerDistributionChunk(distribution.distribution_id)

    const shareRows = await getPostShareRowsForTest({
      sharedByUserId: sender.id,
      postId,
    })

    expect(shareRows).toHaveLength(1)
    expect(shareRows[0]?.recipient_user_id).toBe(follower.id)
    expect(shareRows[0]?.sort_at.getTime()).toBe(postCreatedAt.getTime())
    expect(shareRows[0]?.shared_at.getTime()).toBeLessThan(postCreatedAt.getTime())
  })

  it('sends post notifications only to selected followers', async () => {
    const username = `selected-sender-${randomUUID()}`
    const sender = await createTestUser({ username })
    const creator = await createTestUser()
    const selectedFollower = await createTestUser()
    const deletedSelectedFollower = await createTestUser()
    const unselectedFollower = await createTestUser()
    const nonFollower = await createTestUser()
    await followUser(selectedFollower, sender)
    await followUser(deletedSelectedFollower, sender)
    await followUser(unselectedFollower, sender)

    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: [selectedFollower.id, deletedSelectedFollower.id],
    })
    await softDeleteUser(deletedSelectedFollower.id)

    const result = await processFollowerDistributionChunk(distribution.distribution_id)

    expect(result).toMatchObject({ completed: true, processed: 1 })
    expect(result.notificationsToDeliver).toHaveLength(1)

    const notificationRows = await getManualSendNotificationRowsForTest({
      sentByUserId: sender.id,
      postId: post.id,
    })

    expect(notificationRows).toEqual([
      { user_id: selectedFollower.id, title: `@${username} sent you a discussion` },
    ])
    expect(notificationRows.map(row => row.user_id)).not.toContain(deletedSelectedFollower.id)
    expect(notificationRows.map(row => row.user_id)).not.toContain(unselectedFollower.id)
    expect(notificationRows.map(row => row.user_id)).not.toContain(nonFollower.id)
  })

  it('rejects oversized selected follower sends', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })

    await expect(
      sendPostToFollowers(sender, post.id, {
        audience: 'selected_followers',
        recipient_user_ids: Array.from({ length: 101 }, () => randomUUID()),
      }),
    ).rejects.toThrow('recipient_user_ids can include at most 100 followers')
  })

  it('shares and sends RSS feed items to followers', async () => {
    const username = `rss-sender-${randomUUID()}`
    const sender = await createTestUser({ username })
    const shareFollower = await createTestUser()
    const sendFollower = await createTestUser()
    await followUser(shareFollower, sender)
    await followUser(sendFollower, sender)

    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const shareItem = await createTestRssFeedItemWithUrl(feedId)
    const sendItem = await createTestRssFeedItemWithUrl(feedId)

    const shareDistribution = await shareRssFeedItemWithFollowers(sender, shareItem.id)
    const sendDistribution = await sendRssFeedItemToFollowers(sender, sendItem.id, {
      audience: 'selected_followers',
      recipient_user_ids: [sendFollower.id],
    })

    await processFollowerDistributionChunk(shareDistribution.distribution_id)
    const sendResult = await processFollowerDistributionChunk(sendDistribution.distribution_id)

    expect(sendResult.notificationsToDeliver).toHaveLength(1)

    const [shareRecipientIds, notificationRows] = await Promise.all([
      getRssFeedItemShareRecipientIdsForTest({
        sharedByUserId: sender.id,
        rssFeedItemId: shareItem.id,
      }),
      getManualSendNotificationRowsForTest({
        sentByUserId: sender.id,
        rssFeedItemId: sendItem.id,
      }),
    ])

    expect(shareRecipientIds).toEqual([shareFollower.id, sendFollower.id].toSorted())
    expect(notificationRows).toEqual([
      { user_id: sendFollower.id, title: `@${username} sent you an article` },
    ])
  })

  it('marks RSS feed item distributions failed when the item is deleted before processing', async () => {
    const sender = await createTestUser()
    const shareFollower = await createTestUser()
    const sendFollower = await createTestUser()
    await followUser(shareFollower, sender)
    await followUser(sendFollower, sender)

    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const shareItem = await createTestRssFeedItemWithUrl(feedId)
    const sendItem = await createTestRssFeedItemWithUrl(feedId)
    const shareDistribution = await shareRssFeedItemWithFollowers(sender, shareItem.id)
    const sendDistribution = await sendRssFeedItemToFollowers(sender, sendItem.id, {
      audience: 'selected_followers',
      recipient_user_ids: [sendFollower.id],
    })
    await softDeleteRssFeedItemsForTest([shareItem.id, sendItem.id])

    const shareResult = await processFollowerDistributionChunk(shareDistribution.distribution_id)
    const sendResult = await processFollowerDistributionChunk(sendDistribution.distribution_id)

    expect(shareResult).toMatchObject({ completed: true, processed: 0 })
    expect(sendResult).toMatchObject({ completed: true, processed: 0 })
    expect(
      await getFollowerDistributionFailureReasonsForTest([
        shareDistribution.distribution_id,
        sendDistribution.distribution_id,
      ]),
    ).toEqual(['RSS feed item not found', 'RSS feed item not found'])
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getFollowerDistributionFailureForTest)
  void (0 as unknown as typeof markFollowerDistributionFailedForTest)
  void (0 as unknown as typeof markUserFollowDeletedBeforeNowForTest)
  void (0 as unknown as typeof setPostBroadcastForTest)
  void (0 as unknown as typeof setPostDeletedForTest)
  void (0 as unknown as typeof streamIncompleteFollowerDistributionIdBatches)
})
