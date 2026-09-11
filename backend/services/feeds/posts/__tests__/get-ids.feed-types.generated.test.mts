import { it, expect, describe } from 'vitest'
import { getPostFeedIds } from '../get-ids.mts'
import {
  followUser,
  followTopic,
  createTestUser,
  createTestPost,
  createTestTopic,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  insertScoredPostTopicCategoryRelation,
} from '@voucha/test-helpers'

describe('getPostFeedIds (feed types)', () => {
  it('returns empty results when user has no follows', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()
    await createTestPost({ user: otherUser })

    const result = await getPostFeedIds(user, { feed_type: 'any' })

    expect(result.results).toEqual([])
    expect(result.page_info.has_next_page).toBe(false)
  })

  it('returns posts from followed users with feed_type=follow_users', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const unfollowedUser = await createTestUser()

    await followUser(user, followedUser)

    const followedPost = await createTestPost({ user: followedUser })
    await createTestPost({ user: unfollowedUser })

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    const foundFollowedPost = result.results.find(r => r.id === followedPost.id)
    expect(foundFollowedPost).toBeDefined()
  })

  it('returns users-private posts from followed users', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()

    await followUser(user, followedUser)

    const followedPost = await createTestPost({
      user: followedUser,
      broadcast: 'users',
      privacy: 'private',
    })

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    const foundFollowedPost = result.results.find(r => r.id === followedPost.id)
    expect(foundFollowedPost).toBeDefined()
  })

  it('returns followers-only posts from followed users', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()

    await followUser(user, followedUser)

    const followedPost = await createTestPost({
      user: followedUser,
      broadcast: 'followers',
      privacy: 'private',
    })

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    const foundFollowedPost = result.results.find(r => r.id === followedPost.id)
    expect(foundFollowedPost).toBeDefined()
  })

  it('returns mutual-follower posts only after the follow is reciprocal', async () => {
    const viewer = await createTestUser()
    const creator = await createTestUser()

    await followUser(viewer, creator)

    const mutualPost = await createTestPost({
      user: creator,
      broadcast: 'mutual_followers',
      privacy: 'private',
    })

    const beforeMutualFollow = await getPostFeedIds(viewer, {
      feed_type: 'follow_users',
      limit: 100,
    })

    expect(beforeMutualFollow.results.some(r => r.id === mutualPost.id)).toBe(false)

    await followUser(creator, viewer)

    const afterMutualFollow = await getPostFeedIds(viewer, {
      feed_type: 'follow_users',
      limit: 100,
    })

    expect(afterMutualFollow.results.some(r => r.id === mutualPost.id)).toBe(true)
  })

  it('returns posts with followed topics with feed_type=follow_topics', async () => {
    const user = await createTestUser()
    const postCreator = await createTestUser()
    const topic = await createTestTopic({ user: postCreator })

    await followTopic(user, topic)

    const post = await createTestPost({ user: postCreator })
    await insertScoredPostTopicCategoryRelation(post.id, topic.id, postCreator.id)

    const result = await getPostFeedIds(user, { feed_type: 'follow_topics', limit: 100 })

    const foundPost = result.results.find(r => r.id === post.id)
    expect(foundPost).toBeDefined()
  })

  it('returns hashtag-only posts linked to followed topics', async () => {
    const user = await createTestUser()
    const postCreator = await createTestUser()
    const topic = await createTestTopic({ user: postCreator })
    const hashtag = `followed-hashtag-${Math.random().toString(36).slice(2, 12)}`
    const aliasId = await createTopHashtagAliasForTest(topic.id, hashtag)
    const post = await createTestPost({ user: postCreator })
    await Promise.all([
      followTopic(user, topic),
      createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: aliasId,
        userId: postCreator.id,
        authoredToken: `#${hashtag}`,
      }),
    ])

    const result = await getPostFeedIds(user, { feed_type: 'follow_topics', limit: 100 })

    expect(result.results.some(row => row.id === post.id)).toBe(true)
  })

  it('returns posts from followed users OR followed topics with feed_type=any', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const topicCreator = await createTestUser()
    const topic = await createTestTopic({ user: topicCreator })

    await followUser(user, followedUser)
    await followTopic(user, topic)

    const postFromFollowedUser = await createTestPost({ user: followedUser })
    const postWithFollowedTopic = await createTestPost({ user: topicCreator })
    await insertScoredPostTopicCategoryRelation(postWithFollowedTopic.id, topic.id, topicCreator.id)

    const result = await getPostFeedIds(user, { feed_type: 'any', limit: 100 })

    const foundPostFromUser = result.results.find(r => r.id === postFromFollowedUser.id)
    const foundPostWithTopic = result.results.find(r => r.id === postWithFollowedTopic.id)
    expect(foundPostFromUser).toBeDefined()
    expect(foundPostWithTopic).toBeDefined()
  })

  it('returns posts from followed users AND followed topics with feed_type=all', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const topic = await createTestTopic({ user: followedUser })

    await followUser(user, followedUser)
    await followTopic(user, topic)

    // Post from followed user without followed topic
    const postOnlyUser = await createTestPost({ user: followedUser })
    // Post from followed user with followed topic
    const postBoth = await createTestPost({ user: followedUser })
    await insertScoredPostTopicCategoryRelation(postBoth.id, topic.id, followedUser.id)

    const result = await getPostFeedIds(user, { feed_type: 'all', limit: 100 })

    const foundPostOnlyUser = result.results.find(r => r.id === postOnlyUser.id)
    const foundPostBoth = result.results.find(r => r.id === postBoth.id)
    expect(foundPostOnlyUser).toBeUndefined()
    expect(foundPostBoth).toBeDefined()
  })
})
