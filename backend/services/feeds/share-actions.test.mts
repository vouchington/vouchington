import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, followUser } from '@voucha/test-helpers'
import { getPostFeedIds } from './posts/get-ids.mts'
import { sharePostWithFollowers } from './share-actions.mts'
import { getPostByAny } from '@services/posts/get'
import { updatePost } from '@services/posts/update'
import { processFollowerDistributionChunk } from '@services/follower-distributions'

describe('share-actions', () => {
  it('fans out post shares only to followers present at share time', async () => {
    const sharer = await createTestUser()
    const followerAtShare = await createTestUser()
    const followerAfterShare = await createTestUser()
    const creator = await createTestUser()
    await followUser(followerAtShare, sharer)

    const post = await createTestPost({ user: creator, post_type: 'discussion', privacy: 'public' })

    const shareResult = await sharePostWithFollowers(sharer, post.id)
    expect(shareResult.status).toBe('accepted')
    await processFollowerDistributionChunk(shareResult.distribution_id)

    await followUser(followerAfterShare, sharer)

    const existingFollowerFeed = await getPostFeedIds(followerAtShare, {
      feed_type: 'follow_users',
      limit: 100,
    })
    const futureFollowerFeed = await getPostFeedIds(followerAfterShare, {
      feed_type: 'follow_users',
      limit: 100,
    })

    const sharedEvent = existingFollowerFeed.results.find(
      row => row.entity_id === post.id && row.delivery_type === 'share',
    )

    expect(sharedEvent).toBeDefined()
    expect(sharedEvent?.shared_by_user_id).toBe(sharer.id)
    expect(sharedEvent?.shared_at).toBeInstanceOf(Date)
    expect(
      futureFollowerFeed.results.some(
        row => row.entity_id === post.id && row.delivery_type === 'share',
      ),
    ).toBe(false)
  })

  it('throws 429 when the same post is shared more than once per day', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const creator = await createTestUser()
    await followUser(follower, sharer)

    const post = await createTestPost({ user: creator, privacy: 'public' })

    await sharePostWithFollowers(sharer, post.id)
    await expect(sharePostWithFollowers(sharer, post.id)).rejects.toThrow(
      'You can only share this once per day',
    )
  })

  it('hides shared posts after the creator tightens broadcast visibility', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const creator = await createTestUser()
    await followUser(follower, sharer)

    const post = await createTestPost({ user: creator, privacy: 'public' })
    const shareResult = await sharePostWithFollowers(sharer, post.id)
    await processFollowerDistributionChunk(shareResult.distribution_id)

    let feed = await getPostFeedIds(follower, {
      feed_type: 'follow_users',
      limit: 100,
    })
    expect(
      feed.results.some(row => row.entity_id === post.id && row.delivery_type === 'share'),
    ).toBe(true)

    const persistedPost = await getPostByAny(post.id)
    expect(persistedPost).toBeDefined()

    await updatePost(creator, persistedPost!, {
      broadcast: 'followers',
      privacy: 'private',
    })

    feed = await getPostFeedIds(follower, {
      feed_type: 'follow_users',
      limit: 100,
    })
    expect(
      feed.results.some(row => row.entity_id === post.id && row.delivery_type === 'share'),
    ).toBe(false)
  })

  it('rejects sharing your own post', async () => {
    const sharer = await createTestUser()
    const ownPost = await createTestPost({ user: sharer, privacy: 'public' })

    await expect(sharePostWithFollowers(sharer, ownPost.id)).rejects.toThrow(
      'You cannot share your own post',
    )
  })

  it('rejects sharing posts that are not broadly visible', async () => {
    const sharer = await createTestUser()
    const creator = await createTestUser()
    const restrictedPost = await createTestPost({
      user: creator,
      privacy: 'public',
      broadcast: 'followers',
    })

    await expect(sharePostWithFollowers(sharer, restrictedPost.id)).rejects.toThrow(
      'Only broadly visible posts can be shared',
    )
  })
})
