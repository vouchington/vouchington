import { describe, expect, it } from 'vitest'
import { scheduler } from 'node:timers/promises'
import { read, write } from '@data-stores/psql'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { createLocalTestUser } from '../../test-helpers/users.mts'
import {
  createLocalTestMembership,
  insertLocalTestRssFeed,
  setLocalRssFeedOwningTopicVoteScore,
} from '../../test-helpers/rss-feeds.mts'

const CRAWL_TIERS_VIEW = 'mv_rss_feed_crawl_tiers'
const RETRYABLE_CONTENTION_MESSAGE = 'Materialized view refresh contention; retryable'

async function refreshMaterializedViewForTest(viewName: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (true) {
    try {
      await refreshMaterializedView(viewName)
      return
    } catch (error) {
      if (!(error instanceof Error) || error.message !== RETRYABLE_CONTENTION_MESSAGE) throw error
      if (Date.now() >= deadline) throw error
      await scheduler.wait(50)
    }
  }
}

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
    await write(
      `/* rss-feed-crawl-tiers.test:weighted-follows */
        INSERT INTO relation__user__follow__rss_feed (subject_id, object_id)
        VALUES ($1, $4), ($2, $4), ($3, $4)`,
      [freeFollower.id, plusFollower.id, proFollower.id, feed.id],
    )

    await refreshMaterializedViewForTest(CRAWL_TIERS_VIEW)

    const { rows } = await read<{ crawl_score: number }>(
      `/* rss-feed-crawl-tiers.test:weighted-score */
        SELECT crawl_score FROM mv_rss_feed_crawl_tiers WHERE rss_feed_id = $1`,
      [feed.id],
    )

    expect(rows[0]?.crawl_score).toBeCloseTo(Math.log(7), 5)
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
    await write(
      `/* rss-feed-crawl-tiers.test:membership-lifecycle-follows */
        INSERT INTO relation__user__follow__rss_feed (subject_id, object_id)
        VALUES ($1, $7), ($2, $7), ($3, $7), ($4, $7), ($5, $7), ($6, $7)`,
      [
        pastDueFollower.id,
        pausedFollower.id,
        cancelledFollower.id,
        expiredFollower.id,
        elapsedFollower.id,
        endedProjectionFollower.id,
        feed.id,
      ],
    )

    await refreshMaterializedViewForTest(CRAWL_TIERS_VIEW)

    const { rows } = await read<{ crawl_score: number }>(
      `/* rss-feed-crawl-tiers.test:membership-lifecycle-score */
        SELECT crawl_score FROM mv_rss_feed_crawl_tiers WHERE rss_feed_id = $1`,
      [feed.id],
    )

    // The past-due Plus follower supplies two demand units; every inactive paid membership
    // falls back to the free weight of one rather than retaining a paid multiplier.
    expect(rows[0]?.crawl_score).toBeCloseTo(Math.log(8), 5)
  })

  it('assigns large tied crawl-score groups to the same capped tier', async () => {
    const {
      rows: [{ count }],
    } = await read<{ count: number }>(
      `/* rss-feed-crawl-tiers.test:enabled-count */
        SELECT COUNT(*)::INT AS count
        FROM rss_feeds
        WHERE is_enabled = TRUE AND deleted_at IS NULL`,
      [],
    )
    const tiedFeedCount = Math.max(30, Math.ceil(count * 0.002))
    const feeds = await Promise.all(
      Array.from({ length: tiedFeedCount }, () => insertLocalTestRssFeed()),
    )
    await Promise.all(feeds.map(feed => setLocalRssFeedOwningTopicVoteScore(feed.id, 1_000_000, 0)))

    await refreshMaterializedViewForTest(CRAWL_TIERS_VIEW)

    const { rows } = await read<{ crawl_tier: number }>(
      `/* rss-feed-crawl-tiers.test:tied-scores */
        SELECT DISTINCT crawl_tier
        FROM mv_rss_feed_crawl_tiers
        WHERE rss_feed_id = ANY($1)
        ORDER BY crawl_tier`,
      [feeds.map(feed => feed.id)],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.crawl_tier).toBeGreaterThan(1)
  })

  it('canonicalizes redirected follows and applies a paid follower weight once', async () => {
    const user = await createLocalTestUser()
    if (!user) throw new Error('Expected test user')

    await createLocalTestMembership(user.id, { plan: 'pro' })
    const canonicalFeed = await insertLocalTestRssFeed()
    const sourceFeed = await insertLocalTestRssFeed()
    await write(
      `/* rss-feed-crawl-tiers.test:redirect-source */
        UPDATE rss_feeds
        SET canonical_rss_feed_id = $1
        WHERE id = $2`,
      [canonicalFeed.id, sourceFeed.id],
    )
    await write(
      `/* rss-feed-crawl-tiers.test:duplicate-follows */
        INSERT INTO relation__user__follow__rss_feed (subject_id, object_id)
        VALUES ($1, $2), ($1, $3)`,
      [user.id, canonicalFeed.id, sourceFeed.id],
    )

    await refreshMaterializedViewForTest(CRAWL_TIERS_VIEW)

    const { rows } = await read<{ crawl_score: number }>(
      `/* rss-feed-crawl-tiers.test:canonical-score */
        SELECT crawl_score
        FROM mv_rss_feed_crawl_tiers
        WHERE rss_feed_id = $1`,
      [canonicalFeed.id],
    )

    expect(rows[0]?.crawl_score).toBeCloseTo(Math.log(4), 5)
  })
})
