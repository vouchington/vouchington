import { describe, expect, it } from 'vitest'
import { createLocalTestUser } from '../../../../test-helpers/data-stores/psql/users.mts'
import {
  createLocalTestMembership,
  insertLocalTestRssFeed,
  setLocalRssFeedOwningTopicVoteScore,
} from '../../../../test-helpers/data-stores/psql/rss-feeds.mts'
import {
  followRssFeed,
  getEnabledRssFeedCount,
  getRssFeedCrawlScore,
  getRssFeedCrawlTiers,
  refreshRssFeedCrawlTiers,
  setCanonicalRssFeed,
} from '../../../../test-helpers/data-stores/psql/rss-feed-crawl-tiers.mts'

describe('mv_rss_feed_crawl_tiers', () => {
  it('depends on the single-current-membership invariant for follower weighting', async () => {
    const user = await createLocalTestUser()
    await createLocalTestMembership(user.id, { plan: 'plus' })

    await expect(createLocalTestMembership(user.id, { plan: 'pro' })).rejects.toMatchObject({
      code: '23505',
    })
  })

  it('weights unique free, Plus, and Pro followers as one, two, and three demand units', async () => {
    const freeFollower = await createLocalTestUser()
    const plusFollower = await createLocalTestUser()
    const proFollower = await createLocalTestUser()
    const feed = await insertLocalTestRssFeed()
    await Promise.all([
      createLocalTestMembership(plusFollower.id, { plan: 'plus' }),
      createLocalTestMembership(proFollower.id, { plan: 'pro' }),
    ])
    await followRssFeed([freeFollower.id, plusFollower.id, proFollower.id], feed.id)
    await refreshRssFeedCrawlTiers()
    expect(await getRssFeedCrawlScore(feed.id)).toBeCloseTo(Math.log(7), 5)
  })

  it('includes current past-due memberships and excludes inactive paid memberships', async () => {
    const pastDueFollower = await createLocalTestUser()
    const pausedFollower = await createLocalTestUser()
    const cancelledFollower = await createLocalTestUser()
    const expiredFollower = await createLocalTestUser()
    const elapsedFollower = await createLocalTestUser()
    const endedProjectionFollower = await createLocalTestUser()
    const feed = await insertLocalTestRssFeed()
    await Promise.all([
      createLocalTestMembership(pastDueFollower.id, { plan: 'plus', status: 'past_due' }),
      createLocalTestMembership(pausedFollower.id, { plan: 'pro', status: 'paused' }),
      createLocalTestMembership(cancelledFollower.id, { plan: 'pro', status: 'cancelled' }),
      createLocalTestMembership(expiredFollower.id, { plan: 'pro', status: 'expired' }),
      createLocalTestMembership(elapsedFollower.id, {
        plan: 'pro',
        expiresAt: new Date(Date.now() - 60_000),
      }),
      createLocalTestMembership(endedProjectionFollower.id, {
        plan: 'pro',
        projectionEndedAt: new Date(),
      }),
    ])
    await followRssFeed(
      [
        pastDueFollower.id,
        pausedFollower.id,
        cancelledFollower.id,
        expiredFollower.id,
        elapsedFollower.id,
        endedProjectionFollower.id,
      ],
      feed.id,
    )
    await refreshRssFeedCrawlTiers()

    // The past-due Plus follower supplies two demand units; every inactive paid membership
    // falls back to the free weight of one rather than retaining a paid multiplier.
    expect(await getRssFeedCrawlScore(feed.id)).toBeCloseTo(Math.log(8), 5)
  })

  it('assigns large tied crawl-score groups to the same capped tier', async () => {
    const count = await getEnabledRssFeedCount()
    const tiedFeedCount = Math.max(30, Math.ceil(count * 0.002))
    const feeds = await Promise.all(
      Array.from({ length: tiedFeedCount }, () => insertLocalTestRssFeed()),
    )
    await Promise.all(feeds.map(feed => setLocalRssFeedOwningTopicVoteScore(feed.id, 1_000_000, 0)))

    await refreshRssFeedCrawlTiers()
    const tiers = await getRssFeedCrawlTiers(feeds.map(feed => feed.id))
    expect(tiers).toHaveLength(1)
    expect(tiers[0]).toBeGreaterThan(1)
  })

  it('canonicalizes redirected follows and applies a paid follower weight once', async () => {
    const user = await createLocalTestUser()
    if (!user) throw new Error('Expected test user')

    await createLocalTestMembership(user.id, { plan: 'pro' })
    const canonicalFeed = await insertLocalTestRssFeed()
    const sourceFeed = await insertLocalTestRssFeed()
    await setCanonicalRssFeed(sourceFeed.id, canonicalFeed.id)
    await followRssFeed([user.id], canonicalFeed.id)
    await followRssFeed([user.id], sourceFeed.id)
    await refreshRssFeedCrawlTiers()
    expect(await getRssFeedCrawlScore(canonicalFeed.id)).toBeCloseTo(Math.log(4), 5)
  })
})
