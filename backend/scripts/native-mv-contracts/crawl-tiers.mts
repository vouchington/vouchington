import assert from 'node:assert/strict'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { createLocalTestUser } from '../../test-helpers/data-stores/psql/users.mts'
import {
  createLocalTestMembership,
  insertLocalTestRssFeed,
  setLocalRssFeedOwningTopicVoteScore,
} from '../../test-helpers/data-stores/psql/rss-feeds.mts'
import {
  followRssFeed,
  getEnabledRssFeedCount,
  getRssFeedCrawlScore,
  getRssFeedCrawlTiers,
  setCanonicalRssFeed,
} from '../../test-helpers/data-stores/psql/rss-feed-crawl-tiers.mts'

function assertNear(actual: number | undefined, expected: number, label: string): void {
  if (actual === undefined) throw new Error(`${label} must have a crawl score`)
  assert.ok(Math.abs(actual - expected) < 0.000005, `${label}: ${actual} versus ${expected}`)
}

export async function checkCrawlTierContracts(): Promise<void> {
  const freeFollower = await createLocalTestUser()
  const plusFollower = await createLocalTestUser()
  const proFollower = await createLocalTestUser()
  const weightedFeed = await insertLocalTestRssFeed()
  await Promise.all([
    createLocalTestMembership(plusFollower.id, { plan: 'plus' }),
    createLocalTestMembership(proFollower.id, { plan: 'pro' }),
  ])
  await followRssFeed([freeFollower.id, plusFollower.id, proFollower.id], weightedFeed.id)
  await refreshMaterializedView('mv_rss_feed_crawl_tiers')
  assertNear(await getRssFeedCrawlScore(weightedFeed.id), Math.log(7), 'free/Plus/Pro weighting')

  const pastDueFollower = await createLocalTestUser()
  const pausedFollower = await createLocalTestUser()
  const cancelledFollower = await createLocalTestUser()
  const expiredFollower = await createLocalTestUser()
  const elapsedFollower = await createLocalTestUser()
  const endedProjectionFollower = await createLocalTestUser()
  const membershipFeed = await insertLocalTestRssFeed()
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
  await refreshMaterializedView('mv_rss_feed_crawl_tiers')
  assertNear(await getRssFeedCrawlScore(membershipFeed.id), Math.log(8), 'inactive paid weights')

  const count = await getEnabledRssFeedCount()
  const tiedFeedCount = Math.max(30, Math.ceil(count * 0.002))
  const tiedFeeds = await Promise.all(
    Array.from({ length: tiedFeedCount }, () => insertLocalTestRssFeed()),
  )
  await Promise.all(
    tiedFeeds.map(feed => setLocalRssFeedOwningTopicVoteScore(feed.id, 1_000_000, 0)),
  )
  await refreshMaterializedView('mv_rss_feed_crawl_tiers')
  const tiers = await getRssFeedCrawlTiers(tiedFeeds.map(feed => feed.id))
  assert.equal(tiers.length, 1, 'every tied score must share one tier')
  assert.ok(tiers[0]! > 1, 'the tied group must receive a capped tier')

  const redirectedFollower = await createLocalTestUser()
  await createLocalTestMembership(redirectedFollower.id, { plan: 'pro' })
  const canonicalFeed = await insertLocalTestRssFeed()
  const sourceFeed = await insertLocalTestRssFeed()
  await setCanonicalRssFeed(sourceFeed.id, canonicalFeed.id)
  await followRssFeed([redirectedFollower.id], canonicalFeed.id)
  await followRssFeed([redirectedFollower.id], sourceFeed.id)
  await refreshMaterializedView('mv_rss_feed_crawl_tiers')
  assertNear(await getRssFeedCrawlScore(canonicalFeed.id), Math.log(4), 'redirected paid follow')
}
