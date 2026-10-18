import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  followUser,
  getFollowerDistributionFailureForTest,
  setPostBroadcastForTest,
} from '@voucha/test-helpers'
import { sendPostToFollowers, sharePostWithFollowers } from './create.mts'
import { processFollowerDistributionChunk } from './process.mts'
import { preflightPostDistributionTarget } from './create-guards.mts'

describe('follower distribution retry after target validation failure', () => {
  it('rejects a target made non-distributable after the route preflight', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public', broadcast: 'everyone' })
    await expect(preflightPostDistributionTarget(sender, 'post_send', post.id)).resolves.toBe(
      post.id,
    )
    await setPostBroadcastForTest(post.id, 'followers')
    await expect(
      sendPostToFollowers(sender, post.id, { audience: 'all_followers' }),
    ).rejects.toMatchObject({ status: 400, message: 'Only broadly visible posts can be sent' })
  })
  it.each(['post_share', 'post_send'] as const)(
    'allows retrying %s when the target fails validation before any delivery',
    async action => {
      const sender = await createTestUser()
      const creator = await createTestUser()
      const follower = await createTestUser()
      await followUser(follower, sender)
      const post = await createTestPost({ user: creator, privacy: 'public', broadcast: 'everyone' })
      const create = () =>
        action === 'post_share'
          ? sharePostWithFollowers(sender, post.id)
          : sendPostToFollowers(sender, post.id, { audience: 'all_followers' })
      const distribution = await create()

      await setPostBroadcastForTest(post.id, 'followers')
      await processFollowerDistributionChunk(distribution.distribution_id)
      await expect(
        getFollowerDistributionFailureForTest(distribution.distribution_id),
      ).resolves.toMatchObject({ failed: true })

      await setPostBroadcastForTest(post.id, 'everyone')
      await expect(create()).resolves.toMatchObject({ status: 'accepted' })
    },
  )

  it.each(['post_share', 'post_send'] as const)(
    'keeps %s blocked when a later chunk fails after an earlier delivery',
    async action => {
      const sender = await createTestUser()
      const creator = await createTestUser()
      const followers = [await createTestUser(), await createTestUser()]
      for (const follower of followers) await followUser(follower, sender)
      const post = await createTestPost({ user: creator, privacy: 'public', broadcast: 'everyone' })
      const create = () =>
        action === 'post_share'
          ? sharePostWithFollowers(sender, post.id)
          : sendPostToFollowers(sender, post.id, { audience: 'all_followers' })
      const distribution = await create()

      await expect(
        processFollowerDistributionChunk(distribution.distribution_id, { chunkSize: 1 }),
      ).resolves.toMatchObject({ processed: 1, completed: false })
      await setPostBroadcastForTest(post.id, 'followers')
      await processFollowerDistributionChunk(distribution.distribution_id, { chunkSize: 1 })
      await expect(
        getFollowerDistributionFailureForTest(distribution.distribution_id),
      ).resolves.toMatchObject({ failed: true })

      await setPostBroadcastForTest(post.id, 'everyone')
      await expect(create()).rejects.toThrow(/You can only (share|send) this once per day/)
    },
  )
})
