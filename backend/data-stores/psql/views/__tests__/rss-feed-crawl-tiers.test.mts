import { describe, expect, it } from 'vitest'
import { createLocalTestUser } from '../../../../test-helpers/data-stores/psql/users.mts'
import {
  createLocalTestMembership,
  insertLocalTestRssFeed,
  setLocalRssFeedOwningTopicVoteScore,
  softDeleteLocalRssFeeds,
} from '../../../../test-helpers/data-stores/psql/rss-feeds.mts'
import {
  followRssFeed,
  getEnabledRssFeedCount,
  getRssFeedCrawlScore,
  getRssFeedCrawlTiers,
  setCanonicalRssFeed,
} from '../../../../test-helpers/data-stores/psql/rss-feed-crawl-tiers.mts'
import { refreshMaterializedViewForTest } from '../../../../test-helpers/refresh-materialized-view-for-test.mts'

function requireScore(actual: number | undefined, label: string): number {
  if (actual === undefined) throw new Error(`${label} must have a crawl score`)
  return actual
}

async function retireOwnedFeeds(feedIds: readonly string[]): Promise<void> {
  if (feedIds.length === 0) return
  await softDeleteLocalRssFeeds(feedIds)
  await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
}

async function readFreePlusProScore(ownedFeedIds: string[]): Promise<number | undefined> {
  const [freeFollower, plusFollower, proFollower, weightedFeed] = await Promise.all([
    createLocalTestUser(),
    createLocalTestUser(),
    createLocalTestUser(),
    insertLocalTestRssFeed(),
  ])
  ownedFeedIds.push(weightedFeed.id)
  await Promise.all([
    createLocalTestMembership(plusFollower.id, { plan: 'plus' }),
    createLocalTestMembership(proFollower.id, { plan: 'pro' }),
  ])
  await followRssFeed([freeFollower.id, plusFollower.id, proFollower.id], weightedFeed.id)
  await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
  return getRssFeedCrawlScore(weightedFeed.id)
}

async function readInactivePaidScore(ownedFeedIds: string[]): Promise<number | undefined> {
  const [
    pastDueFollower,
    pausedFollower,
    cancelledFollower,
    expiredFollower,
    elapsedFollower,
    endedProjectionFollower,
    membershipFeed,
  ] = await Promise.all([
    createLocalTestUser(),
    createLocalTestUser(),
    createLocalTestUser(),
    createLocalTestUser(),
    createLocalTestUser(),
    createLocalTestUser(),
    insertLocalTestRssFeed(),
  ])
  ownedFeedIds.push(membershipFeed.id)
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
    membershipFeed.id,
  )
  await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
  return getRssFeedCrawlScore(membershipFeed.id)
}

async function readTiedScoreTiers(ownedFeedIds: string[]): Promise<number[]> {
  const count = await getEnabledRssFeedCount()
  const tiedFeedCount = Math.max(30, Math.ceil(count * 0.002))
  const tiedFeeds = await Promise.all(
    Array.from({ length: tiedFeedCount }, () => insertLocalTestRssFeed()),
  )
  ownedFeedIds.push(...tiedFeeds.map(feed => feed.id))
  await Promise.all(
    tiedFeeds.map(feed => setLocalRssFeedOwningTopicVoteScore(feed.id, 1_000_000, 0)),
  )
  await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
  return getRssFeedCrawlTiers(tiedFeeds.map(feed => feed.id))
}

async function readRedirectedPaidScore(ownedFeedIds: string[]): Promise<number | undefined> {
  const [redirectedFollower, canonicalFeed, sourceFeed] = await Promise.all([
    createLocalTestUser(),
    insertLocalTestRssFeed(),
    insertLocalTestRssFeed(),
  ])
  ownedFeedIds.push(canonicalFeed.id, sourceFeed.id)
  await Promise.all([
    createLocalTestMembership(redirectedFollower.id, { plan: 'pro' }),
    setCanonicalRssFeed(sourceFeed.id, canonicalFeed.id),
  ])
  await followRssFeed([redirectedFollower.id], canonicalFeed.id)
  await followRssFeed([redirectedFollower.id], sourceFeed.id)
  await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
  return getRssFeedCrawlScore(canonicalFeed.id)
}

describe('mv_rss_feed_crawl_tiers', () => {
  it('depends on the single-current-membership invariant for follower weighting', async () => {
    const user = await createLocalTestUser()
    await createLocalTestMembership(user.id, { plan: 'plus' })

    await expect(createLocalTestMembership(user.id, { plan: 'pro' })).rejects.toMatchObject({
      code: '23505',
    })
  })

  it('weights membership follows, caps one tied score group, and scores a redirected paid follow once', async () => {
    const ownedFeedIds: string[] = []
    try {
      const weighted = await readFreePlusProScore(ownedFeedIds)
      expect(requireScore(weighted, 'free/Plus/Pro weighting')).toBeCloseTo(Math.log(7), 5)
      const inactive = await readInactivePaidScore(ownedFeedIds)
      expect(requireScore(inactive, 'inactive paid weights')).toBeCloseTo(Math.log(8), 5)
      const tiers = await readTiedScoreTiers(ownedFeedIds)
      expect(tiers).toHaveLength(1)
      expect(tiers[0]).toBeGreaterThan(1)
      const redirected = await readRedirectedPaidScore(ownedFeedIds)
      expect(requireScore(redirected, 'redirected paid follow')).toBeCloseTo(Math.log(4), 5)
    } finally {
      await retireOwnedFeeds(ownedFeedIds)
    }
  })
})
