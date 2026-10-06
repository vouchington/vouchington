/**
 * RSS feeds entity helpers
 */

import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { createRandomString } from '../data.mts'
import { createTestTopic, setTestTopicHostnameLink } from './create-test-entities.mts'
import { insertTestUrlDirect } from './urls.mts'
import {
  addRssFeedTopicPublisherType,
  addRssFeedTopicPublisherTypeWithScore,
  setRssFeedOwningTopicVoteScore,
} from './rss-feeds-topic-scoring.mts'

export {
  deleteRssFeedsByIds,
  ensureTestRssFeedEnabled,
  getRssFeedDeletedAt,
  updateRssFeedTiming,
} from './rss-feeds-state.mts'

export {
  checkItemClusterEligible,
  checkItemUnsuppressedGlobal,
  getRssFeedCrawlById,
} from './rss-feeds-discovery.mts'

// Split out of this file (concern: owning-topic publisher-type/vote-score primitives) into
// rss-feeds-topic-scoring.mts; kept re-exported here so `@voucha/test-helpers` and
// `@voucha/test-helpers/entities/rss-feeds` consumers resolve unchanged.
export {
  addRssFeedTopicPublisherType,
  addRssFeedTopicPublisherTypeWithScore,
  setRssFeedOwningTopicVoteScore,
}
// Raw-primitive substitute for @services/rss-feeds' createRssFeed, for callers that only need an
// rss_feeds row to exist (as incidental fixture setup for an unrelated entity/behavior under test)
// and don't need createRssFeed's real validation or its enqueueBulkFetchRssFeeds /
// enqueueEvaluateRssFeedDiscoverability side effects. Packages that @services/rss-feeds itself
// depends on (directly or transitively — e.g. @services/rss-feed-items, @services/users,
// @services/elections-votes, @services/entity-cache, @services/notifications,
// @services/user-import-export, @services/moderation, @data-stores/psql) must use this instead of
// @services/rss-feeds/test-fixtures's createTestRssFeed: importing that fixture would give those
// packages a devDependency back on @services/rss-feeds, closing a workspace dependency cycle.
export async function insertTestRssFeedDirect(options: {
  topicId?: string
  topicHostname?: string
  title?: string
  rssFeedUrl?: string
  homePageUrl?: string
  feedType?: 'article' | 'podcast' | 'video' | 'mixed'
  provenance?: ContentProvenance
}): Promise<{ id: string; rss_feed_url_id: string }> {
  const random = createRandomString(13)

  let topicId = options.topicId
  if (!topicId) {
    const topic = await createTestTopic({
      hostname: options.topicHostname || `feed-${random}.example.com`,
    })
    topicId = topic.id
  }

  const { id, rssFeedUrlId } = await insertTestRssFeedWithUrlId({
    topicId,
    title: options.title || `Test Feed ${random}`,
    rssFeedUrl: options.rssFeedUrl,
    homePageUrl: options.homePageUrl,
    feedType: options.feedType,
    provenance: options.provenance,
  })
  return { id, rss_feed_url_id: rssFeedUrlId }
}

/**
 * Create a test RSS feed and its backing rss_feed_url_id, for callers that need to reference
 * the feed's own URL row (e.g. to attach rss_feed_items to it) in addition to the feed id.
 */
export async function insertTestRssFeedWithUrlId(data: {
  topicId: string
  title: string
  rssFeedUrl?: string
  homePageUrl?: string
  feedType?: 'article' | 'podcast' | 'video' | 'mixed'
  provenance?: ContentProvenance
}): Promise<{ id: string; rssFeedUrlId: string }> {
  const random = createRandomString(13)
  const rssFeedUrl = data.rssFeedUrl || `https://feed-${random}.example.com/feed.xml`
  const homePageUrl = data.homePageUrl || `https://feed-${random}.example.com/home`
  const hostname = new URL(homePageUrl).hostname

  const rssFeedUrlObj = await insertTestUrlDirect(null, rssFeedUrl, {
    content_type: 'application/rss+xml',
  })
  await insertTestUrlDirect(null, homePageUrl, { content_type: 'text/html' })

  const hostnameResult = await write(sql`/* insertTestRssFeedWithUrlId */
    INSERT INTO url_hostnames (hostname)
    VALUES (${hostname})
    ON CONFLICT (hostname) DO UPDATE
    SET hostname = EXCLUDED.hostname
    RETURNING id
  `)
  await setTestTopicHostnameLink(data.topicId, hostnameResult.rows[0].id as string)

  const { rows } = await write(sql`/* insertTestRssFeedWithUrlId */
    INSERT INTO rss_feeds (
      rss_feed_url_id,
      topic_id,
      title,
      feed_type,
      created_via,
      created_via_oauth_client_id
    )
    VALUES (
      ${rssFeedUrlObj!.id},
      ${data.topicId},
      ${data.title},
      ${data.feedType ?? 'article'},
      ${data.provenance?.createdVia ?? 'system'},
      ${data.provenance?.oauthClientId ?? null}
    )
    RETURNING id
  `)
  await write(sql`/* insertTestRssFeedWithUrlId */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('enablement', ${rows[0].id}, TRUE, 'test helper initial state')
  `)
  await write(sql`/* insertTestRssFeedWithUrlId */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('discoverability', ${rows[0].id}, TRUE, 'test helper initial state')
  `)
  return { id: rows[0].id as string, rssFeedUrlId: rssFeedUrlObj!.id as string }
}

/**
 * Create a test RSS feed
 */
export async function insertTestRssFeed(data: {
  topicId: string
  title: string
  rssFeedUrl?: string
  homePageUrl?: string
  feedType?: 'article' | 'podcast' | 'video' | 'mixed'
  provenance?: ContentProvenance
}): Promise<string> {
  const { id } = await insertTestRssFeedWithUrlId(data)
  return id
}

/**
 * Update created_at for a rss feed follow relation (for time-range test setup)
 */
export async function updateRssFeedFollowCreatedAt(
  userId: string,
  feedId: string,
  createdAt: Date,
): Promise<void> {
  const { rowCount } = await write(sql`/* updateRssFeedFollowCreatedAt */
    UPDATE relation__user__follow__rss_feed
    SET created_at = ${createdAt}
    WHERE subject_id = ${userId} AND object_id = ${feedId}
  `)
  if (rowCount !== 1) {
    throw new Error(`updateRssFeedFollowCreatedAt: expected 1 row updated, got ${rowCount}`)
  }
}
