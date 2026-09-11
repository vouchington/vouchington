import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestRssFeed,
  insertTestTopic,
  insertEntityRelation,
  insertTestLocalFollow,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { updateRssFeedById } from '@services/rss-feeds/update'
import { getRecommendedRssFeeds } from './get-recommendations.mts'

describe('getRecommendedRssFeeds', () => {
  let currentUser: PrivateUser
  let friend: PrivateUser
  let admin: PrivateUser
  let friendFeedId: string
  let topicFeedId: string
  let followedTopicId: string
  let followedFeedId: string
  const random = Math.random().toString(36).slice(2, 10)

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    currentUser = await createTestUser()
    friend = await createTestUser()

    // currentUser follows friend
    await insertTestLocalFollow(currentUser.id, friend.id)

    // Create a topic currentUser follows
    followedTopicId = await insertTestTopic({
      name: `Rec Topic ${random}`,
      slug: `rec-topic-${random}`,
      createdById: admin.id,
    })
    await insertEntityRelation('relation__user__follow__topic', currentUser.id, followedTopicId)

    // Create a feed currentUser already follows
    const alreadyFollowedTopicId = await insertTestTopic({
      name: `Rec Already Followed Topic ${random}`,
      slug: `rec-already-followed-topic-${random}`,
      createdById: admin.id,
    })
    followedFeedId = await insertTestRssFeed({
      topicId: alreadyFollowedTopicId,
      title: `Already Followed Feed ${random}`,
    })
    await insertEntityRelation('relation__user__follow__rss_feed', currentUser.id, followedFeedId)

    // Create a feed friend follows (friend recommendation)
    const friendTopicId = await insertTestTopic({
      name: `Rec Friend Topic ${random}`,
      slug: `rec-friend-topic-${random}`,
      createdById: admin.id,
    })
    friendFeedId = await insertTestRssFeed({
      topicId: friendTopicId,
      title: `Friend Feed ${random}`,
    })
    await insertEntityRelation('relation__user__follow__rss_feed', friend.id, friendFeedId)

    // Create a feed under the followed topic (topic recommendation)
    topicFeedId = await insertTestRssFeed({
      topicId: followedTopicId,
      title: `Topic Feed ${random}`,
    })
  })

  it('includes feeds followed by friends (score 3.0)', async () => {
    const { results } = await getRecommendedRssFeeds(currentUser.id, {
      limit: 100,
      source: 'friends',
    })
    const ids = results.map(r => r.id)
    expect(ids).toContain(friendFeedId)

    const found = results.find(r => r.id === friendFeedId)!
    expect(found.recommendation_reasons).toContain('friends')
  })

  it('includes feeds from followed topics (score 2.5)', async () => {
    const { results } = await getRecommendedRssFeeds(currentUser.id, {
      limit: 100,
      source: 'topic',
    })
    const ids = results.map(r => r.id)
    expect(ids).toContain(topicFeedId)

    const found = results.find(r => r.id === topicFeedId)!
    expect(found.recommendation_reasons).toContain('topic')
  })

  it('excludes feeds the current user already follows', async () => {
    const { results } = await getRecommendedRssFeeds(currentUser.id, {
      limit: 100,
      source: 'all',
    })
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(followedFeedId)
  })

  it('excludes disabled and undiscoverable feeds', async () => {
    const randomState = Math.random().toString(36).slice(2, 10)
    const disabledTopicId = await insertTestTopic({
      name: `Rec Disabled Topic ${randomState}`,
      slug: `rec-disabled-topic-${randomState}`,
      createdById: admin.id,
    })
    const hiddenTopicId = await insertTestTopic({
      name: `Rec Hidden Topic ${randomState}`,
      slug: `rec-hidden-topic-${randomState}`,
      createdById: admin.id,
    })
    const disabledFeedId = await insertTestRssFeed({
      topicId: disabledTopicId,
      title: `Disabled Feed ${randomState}`,
    })
    const hiddenFeedId = await insertTestRssFeed({
      topicId: hiddenTopicId,
      title: `Hidden Feed ${randomState}`,
    })
    await insertEntityRelation('relation__user__follow__rss_feed', friend.id, disabledFeedId)
    await insertEntityRelation('relation__user__follow__rss_feed', friend.id, hiddenFeedId)
    await updateRssFeedById(disabledFeedId, { enabled: false, discoverable: true })
    await updateRssFeedById(hiddenFeedId, { enabled: true, discoverable: false })

    const { results } = await getRecommendedRssFeeds(currentUser.id, {
      limit: 100,
      source: 'friends',
    })

    const ids = results.map(r => r.id)
    expect(ids).not.toContain(disabledFeedId)
    expect(ids).not.toContain(hiddenFeedId)
  })

  it('returns friend recommendations higher scored than topic recommendations', async () => {
    const { results } = await getRecommendedRssFeeds(currentUser.id, {
      limit: 100,
      source: 'all',
    })
    const friendRec = results.find(r => r.id === friendFeedId)
    const topicRec = results.find(r => r.id === topicFeedId)

    expect(friendRec).toBeDefined()
    expect(topicRec).toBeDefined()
    expect(friendRec!.recommendation_score).toBeGreaterThan(topicRec!.recommendation_score)
  })

  it('returns empty results for user with no social connections', async () => {
    const lonelyUser = await createTestUser()
    const { results, page_info } = await getRecommendedRssFeeds(lonelyUser.id, {
      limit: 25,
      source: 'all',
    })
    expect(results).toHaveLength(0)
    expect(page_info.has_next_page).toBe(false)
  })

  it('supports pagination with after cursor', async () => {
    const first = await getRecommendedRssFeeds(currentUser.id, { limit: 1, source: 'all' })

    expect(first.page_info.has_next_page).toBe(true)
    expect(first.page_info.end_cursor).not.toBeNull()

    const second = await getRecommendedRssFeeds(currentUser.id, {
      limit: 1,
      after: first.page_info.end_cursor!,
      source: 'all',
    })
    expect(second.results).toHaveLength(1)
    expect(second.results[0].id).not.toBe(first.results[0].id)
  })

  it('returns 400 for invalid cursor', async () => {
    await expect(
      getRecommendedRssFeeds(currentUser.id, { limit: 10, after: 'badinput!!' }),
    ).rejects.toThrow(Error)
  })
})
