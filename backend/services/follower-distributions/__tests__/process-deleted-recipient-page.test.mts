import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, followUser, softDeleteUser } from '@voucha/test-helpers'
import { sendPostToFollowers } from '../create.mts'
import { processFollowerDistributionChunk } from '../process.mts'

describe('selected follower pages', () => {
  it('fills a one-recipient page past a deleted selected follower', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const deletedFollower = await createTestUser()
    const liveFollower = await createTestUser()
    const laterFollower = await createTestUser()
    await followUser(deletedFollower, sender)
    await followUser(liveFollower, sender)
    await followUser(laterFollower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: [deletedFollower.id, liveFollower.id, laterFollower.id],
    })
    await softDeleteUser(deletedFollower.id)

    const first = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 1,
    })
    expect(first).toMatchObject({
      completed: false,
      processed: 1,
      cursorRecipientId: liveFollower.id,
    })
    expect(first.notificationsToDeliver.map(notification => notification.userId)).toEqual([
      liveFollower.id,
    ])
    const last = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 1,
    })
    expect(last).toMatchObject({
      completed: true,
      processed: 1,
      cursorRecipientId: laterFollower.id,
    })
    expect(last.notificationsToDeliver.map(notification => notification.userId)).toEqual([
      laterFollower.id,
    ])
  })
})
