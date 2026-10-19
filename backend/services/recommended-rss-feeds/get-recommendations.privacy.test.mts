import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertEntityRelation,
  insertTestLocalFollow,
  insertTestRssFeed,
  insertTestTopic,
  softDeleteUser,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'
import { getRecommendedRssFeeds } from './get-recommendations.mts'

describe('RSS recommendation privacy', () => {
  it('keeps a visible friend feed and drops hidden, restricted, deleted, and one-way mutual feeds', async () => {
    const [
      viewer,
      visibleFriend,
      hiddenFriend,
      restrictedFriend,
      deletedFriend,
      oneWayMutual,
      mutualFriend,
    ] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    await Promise.all([
      insertTestLocalFollow(viewer.id, visibleFriend.id),
      insertTestLocalFollow(viewer.id, hiddenFriend.id),
      insertTestLocalFollow(viewer.id, restrictedFriend.id),
      insertTestLocalFollow(viewer.id, deletedFriend.id),
      insertTestLocalFollow(viewer.id, oneWayMutual.id),
      insertTestLocalFollow(viewer.id, mutualFriend.id),
      insertTestLocalFollow(mutualFriend.id, viewer.id),
    ])
    await Promise.all([
      updateUserFields(visibleFriend.id, { rss_feed_follows_visibility: 'followers' }),
      updateUserFields(hiddenFriend.id, { rss_feed_follows_visibility: 'nobody' }),
      updateUserFields(restrictedFriend.id, {
        rss_feed_follows_visibility: 'everyone',
        processing_restricted_at: true,
      }),
      updateUserFields(oneWayMutual.id, { rss_feed_follows_visibility: 'mutual_followers' }),
      updateUserFields(mutualFriend.id, { rss_feed_follows_visibility: 'mutual_followers' }),
    ])
    const [
      visibleFeedId,
      hiddenFeedId,
      restrictedFeedId,
      deletedFeedId,
      oneWayFeedId,
      mutualFeedId,
    ] = await Promise.all([
      followDiscoverableFeed(visibleFriend.id, 'visible'),
      followDiscoverableFeed(hiddenFriend.id, 'hidden'),
      followDiscoverableFeed(restrictedFriend.id, 'restricted'),
      followDiscoverableFeed(deletedFriend.id, 'deleted'),
      followDiscoverableFeed(oneWayMutual.id, 'one-way'),
      followDiscoverableFeed(mutualFriend.id, 'mutual'),
    ])
    await softDeleteUser(deletedFriend.id)

    const { results } = await getRecommendedRssFeeds(viewer.id, {
      limit: 100,
      source: 'friends',
    })
    const ids = results.map(result => result.id)

    expect(ids).toContain(visibleFeedId)
    expect(ids).toContain(mutualFeedId)
    expect(ids).not.toContain(hiddenFeedId)
    expect(ids).not.toContain(restrictedFeedId)
    expect(ids).not.toContain(deletedFeedId)
    expect(ids).not.toContain(oneWayFeedId)
  })

  it('keeps a public collaborative overlap and drops a private overlap', async () => {
    const [viewer, publicNeighbor, privateNeighbor] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    await updateUserFields(privateNeighbor.id, { rss_feed_follows_visibility: 'nobody' })
    const sharedFeedId = await followDiscoverableFeed(viewer.id, 'shared')
    await Promise.all([
      insertEntityRelation('relation__user__follow__rss_feed', publicNeighbor.id, sharedFeedId),
      insertEntityRelation('relation__user__follow__rss_feed', privateNeighbor.id, sharedFeedId),
    ])
    const [publicFeedId, privateFeedId] = await Promise.all([
      followDiscoverableFeed(publicNeighbor.id, 'public-neighbor'),
      followDiscoverableFeed(privateNeighbor.id, 'private-neighbor'),
    ])

    const { results } = await getRecommendedRssFeeds(viewer.id, {
      limit: 100,
      source: 'collaborative',
    })
    const ids = results.map(result => result.id)

    expect(ids).toContain(publicFeedId)
    expect(ids).not.toContain(privateFeedId)
  })

  it('lets an administrator use a hidden follow signal but not a processing-restricted one', async () => {
    const [admin, hiddenFriend, restrictedFriend] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])
    await Promise.all([
      insertTestLocalFollow(admin.id, hiddenFriend.id),
      insertTestLocalFollow(admin.id, restrictedFriend.id),
      updateUserFields(hiddenFriend.id, { rss_feed_follows_visibility: 'nobody' }),
      updateUserFields(restrictedFriend.id, {
        rss_feed_follows_visibility: 'everyone',
        processing_restricted_at: true,
      }),
    ])
    const [hiddenFeedId, restrictedFeedId] = await Promise.all([
      followDiscoverableFeed(hiddenFriend.id, 'admin-hidden'),
      followDiscoverableFeed(restrictedFriend.id, 'admin-restricted'),
    ])

    const { results } = await getRecommendedRssFeeds(admin.id, {
      limit: 100,
      source: 'friends',
    })
    const ids = results.map(result => result.id)

    expect(ids).toContain(hiddenFeedId)
    expect(ids).not.toContain(restrictedFeedId)
  })
})

async function followDiscoverableFeed(followerId: string, label: string): Promise<string> {
  const author = await createTestUser({ administrator: true })
  const suffix = `${label}-${crypto.randomUUID()}`
  const topicId = await insertTestTopic({
    name: `RSS privacy ${suffix}`,
    slug: `rss-privacy-${suffix}`,
    createdById: author.id,
  })
  const feedId = await insertTestRssFeed({
    topicId,
    title: `RSS privacy feed ${suffix}`,
  })
  await insertEntityRelation('relation__user__follow__rss_feed', followerId, feedId)
  return feedId
}
