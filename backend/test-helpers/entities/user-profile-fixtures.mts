import { insertTestUrlDirect } from './urls.mts'
import { createTestPost, createTestTopic } from './create-test-entities.mts'
import { insertEntityRelation } from './entity-relations.mts'
import {
  insertRecentlyViewedRssFeedItem,
  insertRecentlyViewedTopic,
  insertUserSavedRssFeedItem,
  updateEntityRelationElection,
} from './user-profile-fixture-mutations.mts'
import { insertTestRssFeedItem } from './rss-feed-items.mts'
import { insertTestRssFeed } from './rss-feeds.mts'
import { insertTestPost, insertTestPostReview } from './posts.mts'
import { createTestUser } from './users.mts'
import { createHash } from 'node:crypto'
import { createRandomString } from '../data.mts'

type CreateUserProfileFixtureOptions = {
  suffix?: string
}

const randomSuffix = () => createRandomString(8)

export async function createUserProfileFixture({
  suffix = randomSuffix(),
}: CreateUserProfileFixtureOptions = {}) {
  const owner = await createTestUser({ username: `users-owner-${suffix}` })
  const follower = await createTestUser({ username: `users-follower-${suffix}` })
  const followingUser = await createTestUser({ username: `users-following-${suffix}` })
  const blockedUser = await createTestUser({ username: `users-blocked-${suffix}` })
  const mutedUser = await createTestUser({ username: `users-muted-${suffix}` })
  const admin = await createTestUser({
    username: `users-admin-${suffix}`,
    administrator: true,
  })

  if (!owner || !follower || !followingUser || !blockedUser || !mutedUser || !admin) {
    throw new Error('Failed to create test users for user profile fixture')
  }

  const followingTopic = await createTestTopic({
    user: owner,
    name: `Following Topic ${suffix}`,
    slug: `following-topic-${suffix}`,
  })
  const blockedTopic = await createTestTopic({
    user: owner,
    name: `Blocked Topic ${suffix}`,
    slug: `blocked-topic-${suffix}`,
  })
  const mutedTopic = await createTestTopic({
    user: owner,
    name: `Muted Topic ${suffix}`,
    slug: `muted-topic-${suffix}`,
  })
  const viewedTopic = await createTestTopic({
    user: owner,
    name: `Viewed Topic ${suffix}`,
    slug: `viewed-topic-${suffix}`,
  })
  const rssTopic = await createTestTopic({
    user: owner,
    name: `RSS Topic ${suffix}`,
    slug: `rss-topic-${suffix}`,
  })

  const rssFeedId = await insertTestRssFeed({
    topicId: rssTopic.id,
    title: `User Feed ${suffix}`,
  })

  const guid = `user-feed-item-${suffix}`
  const rssItemUrl = await insertTestUrlDirect(null, `https://example.com/${guid}`, {
    content_type: 'text/html',
  })
  const rssItemId = await insertTestRssFeedItem({
    rssFeedId,
    urlId: rssItemUrl!.id,
    guid,
    itemData: {
      title: 'User feed item',
      link: rssItemUrl!.url,
      guid,
      isoDate: new Date().toISOString(),
    },
    contentSha256: createHash('sha256').update(guid).digest(),
  })

  const discussion = await createTestPost({
    user: owner,
    post_type: 'discussion',
    title: `User Discussion ${suffix}`,
    markdown: 'User-authored discussion for profile metrics',
  })
  const reviewId = await insertTestPost({
    createdById: owner.id,
    postType: 'review',
    title: `User Review ${suffix}`,
    slug: `user-review-${suffix}`,
    markdown:
      'This product is absolutely fantastic and I highly recommend it to anyone looking for quality. The design is sleek, intuitive, and user-friendly in every way possible. After using it for several months, it has exceeded all of my expectations completely.',
    // insertTestPost already defaults clearanceStatus to 'approved' so it counts in public metrics.
  })
  await insertTestPostReview(reviewId, followingTopic.id, 5)
  const review = { id: reviewId }
  const comment = await createTestPost({
    user: owner,
    post_type: 'comment',
    parent_id: discussion!.id,
    markdown: 'User-authored comment for profile metrics',
  })

  await insertEntityRelation('relation__post__category__topic', discussion!.id, followingTopic.id)
  await updateEntityRelationElection(
    'relation__post__category__topic',
    discussion!.id,
    followingTopic.id,
    {
      votes_score_up: 1,
      votes_count_up: 1,
    },
  )

  await insertEntityRelation('relation__user__follow__user', owner.id, followingUser.id)
  await insertEntityRelation('relation__user__follow__user', follower.id, owner.id)
  await insertEntityRelation('relation__user__follow__topic', owner.id, followingTopic.id)
  await insertEntityRelation('relation__user__block__topic', owner.id, blockedTopic.id)
  await insertEntityRelation('relation__user__mute__topic', owner.id, mutedTopic.id)
  await insertEntityRelation('relation__user__block__user', owner.id, blockedUser.id)
  await insertEntityRelation('relation__user__mute__user', owner.id, mutedUser.id)
  await insertEntityRelation('relation__user__follow__rss_feed', owner.id, rssFeedId)

  await insertRecentlyViewedTopic(owner.id, viewedTopic.id)
  await insertUserSavedRssFeedItem(owner.id, rssItemId)
  await insertRecentlyViewedRssFeedItem(owner.id, rssItemId)

  return {
    owner,
    admin,
    follower,
    followingUser,
    blockedUser,
    mutedUser,
    followingTopic,
    blockedTopic,
    mutedTopic,
    viewedTopic,
    rssFeedId,
    rssItemId,
    discussion: discussion!,
    review,
    comment: comment!,
  }
}
