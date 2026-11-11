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
import {
  processFollowerDistributionChunk,
  sharePostWithFollowers,
} from '@services/follower-distributions'

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

    const results: Awaited<ReturnType<typeof getPostFeedIds>>['results'] = []
    let after: string | undefined
    for (let index = 0; index < 30; index++) {
      const page = await getPostFeedIds(viewer, { feed_type: 'follow_users', limit: 10, after })
      results.push(...page.results)
      if (
        results.some(row => row.entity_id === olderDirectPost.id) ||
        !page.page_info.has_next_page
      )
        break
      const next = page.page_info.end_cursor ?? undefined
      if (!next || next === after) throw new Error('Expected advancing feed cursor')
      after = next
    }
    expect(results.map(row => row.entity_id)).toEqual([sharedPost.id, olderDirectPost.id])
    expect(results[0]?.delivery_type).toBe('share')
    expect(new Set(results.map(row => row.id)).size).toBe(results.length)
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
