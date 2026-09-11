import { setTimeout as sleep } from 'node:timers/promises'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  followTopic,
  followUser,
  insertTestReview,
} from '../../backend/test-helpers/index.mts'
import { upsertPostElectionVotes } from '../../backend/services/elections-votes/post/index.mts'
import { upsertTopicElectionVotes } from '../../backend/services/elections-votes/topic/index.mts'
import type { PrivateUser } from '../../backend/services/users/types.mts'
import { getTopicByAny } from '../../backend/services/topics/get.mts'
import { randomSuffix } from './random-id.mts'

// Accepts the viewer explicitly so each spec provides its own isolated user
// (via withCleanUser) rather than mutating the shared seeded test user.
export async function insertPersonalizedTopicFixture(viewer: PrivateUser) {
  const unique = randomSuffix()
  const followedUser = await createTestUser({ username: `pw-followed-${unique}` })
  if (!followedUser) throw new Error('Failed to create followedUser')
  const unfollowedUser = await createTestUser({ username: `pw-unfollowed-${unique}` })
  if (!unfollowedUser) throw new Error('Failed to create unfollowedUser')
  const topic = await createTestTopic({
    user: viewer,
    name: `Playwright Personalized Topic ${unique}`,
    slug: `pw-personalized-topic-${unique}`,
    topic_type: 'topic',
  })
  const topicEntity = await getTopicByAny(topic.id)
  if (!topicEntity) throw new Error('Failed to load personalized topic')

  await followUser(viewer, followedUser)
  await followTopic(followedUser, topic)
  await followTopic(unfollowedUser, topic)

  await upsertTopicElectionVotes(followedUser.id, [{ entityId: topicEntity.id, score: 1 }])
  await upsertTopicElectionVotes(unfollowedUser.id, [{ entityId: topicEntity.id, score: -1 }])

  const followedReviewTitle = `Followed Review ${unique}`
  await insertTestReview({
    userId: followedUser.id,
    topicRatings: [{ topicId: topic.id, rating: 5 }],
    title: followedReviewTitle,
    markdown: 'followed review',
  })

  await sleep(20)

  const unfollowedReviewTitle = `Unfollowed Review ${unique}`
  await insertTestReview({
    userId: unfollowedUser.id,
    topicRatings: [{ topicId: topic.id, rating: 3 }],
    title: unfollowedReviewTitle,
    markdown: 'unfollowed review',
  })

  return {
    topicId: topic.id,
    followedUsername: followedUser.username!,
    unfollowedUsername: unfollowedUser.username!,
    followedReviewTitle,
    unfollowedReviewTitle,
  }
}

export async function insertPersonalizedPostFixture(viewer: PrivateUser) {
  const unique = randomSuffix()
  const followedUser = await createTestUser({ username: `pw-post-followed-${unique}` })
  if (!followedUser) throw new Error('Failed to create followedUser')
  const unfollowedUser = await createTestUser({ username: `pw-post-unfollowed-${unique}` })
  if (!unfollowedUser) throw new Error('Failed to create unfollowedUser')
  const author = await createTestUser({ username: `pw-post-author-${unique}` })
  if (!author) throw new Error('Failed to create author')
  const post = await createTestPost({
    user: author,
    title: `Playwright Personalized Post ${unique}`,
    slug: `pw-personalized-post-${unique}`,
    post_type: 'discussion',
    markdown: 'personalized post content',
  })

  await followUser(viewer, followedUser)
  await upsertPostElectionVotes(followedUser.id, [{ entityId: post.id, score: 1 }])
  await upsertPostElectionVotes(unfollowedUser.id, [{ entityId: post.id, score: -1 }])

  return {
    postId: post.id,
    followedUsername: followedUser.username!,
    unfollowedUsername: unfollowedUser.username!,
  }
}
