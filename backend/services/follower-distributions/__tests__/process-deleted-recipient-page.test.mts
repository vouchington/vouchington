import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, followUser, softDeleteUser } from '@voucha/test-helpers'
import { sendPostToFollowers } from '../create.mts'
import { processFollowerDistributionChunk } from '../process.mts'

describe('selected follower pages', () => {
  it('advances a one-recipient page past a deleted selected follower', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const deletedFollower = await createTestUser()
    const liveFollower = await createTestUser()
    await followUser(deletedFollower, sender)
    await followUser(liveFollower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: [deletedFollower.id, liveFollower.id],
    })
    await softDeleteUser(deletedFollower.id)

    const first = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 1,
    })
    expect(first).toMatchObject({
      completed: false,
      processed: 0,
      cursorRecipientId: deletedFollower.id,
    })
    const second = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 1,
    })
    expect(second).toMatchObject({
      completed: false,
      processed: 1,
      cursorRecipientId: liveFollower.id,
    })
    const done = await processFollowerDistributionChunk(distribution.distribution_id, {
      chunkSize: 1,
    })
    expect(done).toMatchObject({ completed: true, processed: 0 })
  })
})
