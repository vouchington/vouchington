import { write } from '../../backend/data-stores/psql/clients.mts'
import { insertTestRssFeedItem } from '../../backend/test-helpers/entities/rss-feed-items.mts'
import { setTopicHostnameLink } from '../../backend/services/topics/hostname-link.mts'
import { PLAYWRIGHT_PODCAST_COVER_URL } from '../../lambdas/playwright-podcast-cover.mts'

// 32-byte zero buffer used as the bedrock_nova_multimodal_v1_content_sha256 placeholder.
// Real crawled topics populate this from the Bedrock embedding pipeline; test fixtures use zeros.
const ZERO_SHA = Buffer.alloc(32)

interface TestPodcastShow {
  /** rss_feeds.id */
  rssFeedId: string
  /** topics.id for the podcast show */
  topicId: string
  /** The topic slug (used to build /source/<slug> URLs) */
  topicSlug: string
  /** Unique category slug (e.g. 'business-<suffix>') for /podcasts/<categorySlug> filter tests */
  categorySlug: string
  /** RSS item (episode) IDs created */
  episodeIds: string[]
}

/**
 * Insert a test podcast show with:
 *   - a topics row (topic_type='rss_feed', required for /source/[slug] routing)
 *   - an rss_feeds row (feed_type='podcast')
 *   - a podcast_shows extension row with dummy metadata
 *   - rss_feed_categories rows
 *   - one rss_feed_items episode with an enclosure (for audio player tests)
 *
 * Uses suffix to ensure unique slugs/hostnames across test runs.
 */
export async function insertTestPodcastShow(suffix: string): Promise<TestPodcastShow> {
  // Hostname
  const hostname = `podcast-${suffix}.example.com`
  const hostnameResult = await write(
    `INSERT INTO url_hostnames (hostname)
     VALUES ($1)
     RETURNING id`,
    [hostname],
  )
  const hostnameId = hostnameResult.rows[0].id as string

  // Topic
  const topicSlug = `podcast-show-${suffix}`
  const topicName = `Test Podcast Show ${suffix}`
  const topicResult = await write(
    `INSERT INTO topics (name, slug, topic_type, created_by_id, bedrock_nova_multimodal_v1_content_sha256, created_via)
     VALUES ($1, $2, 'rss_feed', '019f0000-0000-7000-8000-000000000000', $3, 'system')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [topicName, topicSlug, ZERO_SHA],
  )
  const topicId = topicResult.rows[0].id as string

  // Link hostname to topic
  await setTopicHostnameLink(topicId, hostnameId)

  // RSS feed URLs
  const feedUrlResult = await write(
    `INSERT INTO urls (url, hostname_id, pathname, search_params)
     VALUES ($1, $2, $3, '{}'::JSONB)
     ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
     RETURNING id`,
    [`https://${hostname}/podcast.xml`, hostnameId, '/podcast.xml'],
  )
  const rssFeedUrlId = feedUrlResult.rows[0].id as string

  // RSS feed
  const feedResult = await write(
    `INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, feed_type, created_via)
     VALUES ($1, $2, $3, 'podcast', 'system')
     RETURNING id`,
    [rssFeedUrlId, topicId, topicName],
  )
  const rssFeedId = feedResult.rows[0].id as string

  // Enable the feed
  await write(
    `INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, reason)
     VALUES ($1, TRUE, 'playwright test fixture')`,
    [rssFeedId],
  )
  await write(
    `INSERT INTO rss_feed_discoverability_changes (rss_feed_id, enabled, reason)
     VALUES ($1, TRUE, 'playwright test fixture')`,
    [rssFeedId],
  )

  // Podcast show metadata — cover_art_url, is_explicit, and description are set so Playwright
  // tests can assert podcast-show-cover-art, podcast-explicit-badge, and podcast-source-description.
  await write(
    `INSERT INTO podcast_shows (rss_feed_id, itunes_author, cover_art_url, is_explicit, itunes_type, description)
     VALUES ($1, $2, $3, TRUE, 'episodic', $4)`,
    [
      rssFeedId,
      'Test Podcast Author',
      PLAYWRIGHT_PODCAST_COVER_URL,
      'A test podcast about interesting topics for Playwright test coverage.',
    ],
  )

  // Create a unique-per-run 'business-<suffix>' category topic so the /podcasts/<categorySlug>
  // filter can resolve it. Using a unique slug (not bare 'business') avoids Valkey null-cache
  // poisoning: getTopicIdByAnyCached caches null for 24 minutes, so a previous run that visited
  // /podcasts/business before this topic existed would leave a stale null in the cache.
  // With a per-run suffix the slug has never been seen before, so the lookup always hits the DB.
  const categorySlug = `business-${suffix}`
  const bizTopicResult = await write(
    `INSERT INTO topics (name, slug, topic_type, created_by_id, bedrock_nova_multimodal_v1_content_sha256, created_via)
     VALUES ($1, $2, 'topic', '019f0000-0000-7000-8000-000000000000', $3, 'system')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [`Business ${suffix}`, categorySlug, ZERO_SHA],
  )
  const bizTopicId = bizTopicResult.rows[0].id as string

  // Feed categories with topic_id linked (so the rss_feed_categories EXISTS filter works).
  await write(
    `INSERT INTO rss_feed_categories (rss_feed_id, category_text, topic_id)
     VALUES ($1, $2, $3), ($1, 'news', NULL)
     ON CONFLICT DO NOTHING`,
    [rssFeedId, categorySlug, bizTopicId],
  )

  // One episode (rss_feed_item) with an enclosure for audio player testing.
  // rss_feed_items has no rss_feed_id column; the feed link goes in rss_feed_item_sources.
  // The JSONB data field must contain media_type/enclosure_url etc. because the frontend
  // reads from item.data.media_type and item.data.enclosure_url; the direct columns are also
  // set for correctness (schema constraints, future direct-column reads).
  const enclosureUrl = `https://${hostname}/episode-1.mp3`
  const episodeUrlResult = await write(
    `INSERT INTO urls (url, hostname_id, pathname, search_params)
     VALUES ($1, $2, $3, '{}'::JSONB)
     ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
     RETURNING id`,
    [`https://${hostname}/episode-1`, hostnameId, '/episode-1'],
  )
  const episodeUrlId = episodeUrlResult.rows[0].id as string

  const episodeId = await insertTestRssFeedItem({
    rssFeedId,
    urlId: episodeUrlId,
    guid: `guid-podcast-${suffix}-1`,
    itemData: {
      title: `Test Episode 1 - ${suffix}`,
      link: `https://${hostname}/episode-1`,
      contentSnippet: 'A test podcast episode for Playwright tests.',
      // These media fields in data are read by news-item-card.tsx (item.data.media_type etc.)
      media_type: 'audio',
      enclosure_url: enclosureUrl,
      enclosure_type: 'audio/mpeg',
      duration_seconds: 1800,
    },
    contentSha256: ZERO_SHA,
  })

  await write(
    `UPDATE rss_feed_items
     SET media_type = 'audio',
         enclosure_url = $2,
         enclosure_type = 'audio/mpeg',
         duration_seconds = 1800
     WHERE id = $1`,
    [episodeId, enclosureUrl],
  )

  // The /source/[slug]/news page fetches items via:
  //   GET /api/v1/rss-feed-items?category_topic=<topicSlug>
  // The search resolves the slug to topicId then filters by:
  //   EXISTS (SELECT 1 FROM rss_feed_item_categories WHERE topic_id = topicId)
  // So the episode must have an rss_feed_item_categories row with topic_id = testPodcastTopicId.
  await write(
    `INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [episodeId, topicSlug, topicId],
  )

  return { rssFeedId, topicId, topicSlug, categorySlug, episodeIds: [episodeId] }
}
