import { it, expect, describe } from 'vitest'
import { getPostFeedIds } from '../get-ids.mts'
import {
  followUser,
  createTestUser,
  createTestPost,
  createTestTopic,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestProxyFollowCommunity,
  insertTestProxyMuteCommunity,
  insertScoredPostTopicCategoryRelation,
} from '@voucha/test-helpers'
import { processFollowerDistributionChunk } from '@services/follower-distributions'
import { sharePostWithFollowers } from '../../share-actions.mts'

describe('getPostFeedIds', () => {
  it('places shared posts ahead of older direct rows using share time', async () => {
    const viewer = await createTestUser()
    const followedUser = await createTestUser()
    const creator = await createTestUser()

    await followUser(viewer, followedUser)

    const olderDirectPost = await createTestPost({ user: followedUser, title: 'Direct post' })
    const sharedPost = await createTestPost({ user: creator, title: 'Shared post' })

    await processFollowerDistributionChunk(
      (await sharePostWithFollowers(followedUser, sharedPost.id)).distribution_id,
    )

    const result = await getPostFeedIds(viewer, {
      feed_type: 'follow_users',
      limit: 10,
    })

    expect(result.results[0]?.entity_id).toBe(sharedPost.id)
    expect(result.results[0]?.delivery_type).toBe('share')
    expect(result.results.some(row => row.entity_id === olderDirectPost.id)).toBe(true)
  })

  it('includes posts tagged with topics from a proxy_follow community list', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic()
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'topic',
      entityId: topic.id,
    })
    await insertTestProxyFollowCommunity(user.id, community.id)

    const post = await createTestPost({ user: owner })
    await insertScoredPostTopicCategoryRelation(post!.id, topic.id, owner.id)

    const result = await getPostFeedIds(user, { feed_type: 'follow_topics', limit: 100 })

    expect(result.results.some(r => r.entity_id === post!.id)).toBe(true)
  })

  it('scopes posts to topics in the selected community list', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const communityTopic = await createTestTopic()
    const unrelatedTopic = await createTestTopic()
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'topic',
      entityId: communityTopic.id,
    })

    const communityPost = await createTestPost({ user: owner })
    const unrelatedPost = await createTestPost({ user: owner })
    await insertScoredPostTopicCategoryRelation(communityPost!.id, communityTopic.id, owner.id)
    await insertScoredPostTopicCategoryRelation(unrelatedPost!.id, unrelatedTopic.id, owner.id)

    const result = await getPostFeedIds(user, {
      community_id: community.id,
      feed_type: 'follow_topics',
      limit: 100,
    })

    expect(result.results.some(r => r.entity_id === communityPost!.id)).toBe(true)
    expect(result.results.some(r => r.entity_id === unrelatedPost!.id)).toBe(false)
  })

  it('excludes posts tagged with topics from a proxy_mute community list', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    await followUser(user, owner)

    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic()
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'topic',
      entityId: topic.id,
    })
    await insertTestProxyMuteCommunity(user.id, community.id)

    const post = await createTestPost({ user: owner })
    await insertScoredPostTopicCategoryRelation(post!.id, topic.id, owner.id)

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    expect(result.results.some(r => r.entity_id === post!.id)).toBe(false)
  })
})
