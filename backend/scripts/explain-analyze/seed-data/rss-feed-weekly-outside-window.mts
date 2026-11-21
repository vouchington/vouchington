import type { TransactionQuery } from '@data-stores/psql'
import { contentHash, FEED_URL_COUNT, postSeedTimestampMs, seedUuid } from './common.mts'

export const RSS_FEED_WEEKLY_WORKLOAD_OUTSIDE_TOKEN = 'rssweekoutside'

export async function seedRssFeedWeeklyOutsideWindow(query: TransactionQuery): Promise<void> {
  await query(
    `/* seedRssFeedWeeklyWorkload.outsideWindow */
      INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
      VALUES ($1, 'seed-week-outside-window')
      ON CONFLICT (url_hostname_id, guid) DO NOTHING`,
    [seedUuid(0, '02')],
  )
  await query(
    `/* seedRssFeedWeeklyWorkload.outsideWindow */
      INSERT INTO rss_feed_items
        (id, url_id, data, gemini_embedding_2_content_sha256, bedrock_nova_multimodal_v1_content_sha256)
      SELECT ids.id, $1,
        jsonb_build_object('title', $2::text, 'link', 'https://example.com/rss-week-outside',
          'isoDate', to_char(($3::timestamptz - INTERVAL '8 days') AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
        $4
      , $4 FROM rss_feed_item_guids ids
      WHERE ids.url_hostname_id = $5 AND ids.guid = 'seed-week-outside-window'
      ON CONFLICT (id) DO NOTHING`,
    [
      seedUuid(FEED_URL_COUNT, '03'),
      RSS_FEED_WEEKLY_WORKLOAD_OUTSIDE_TOKEN,
      new Date(postSeedTimestampMs(0)).toISOString(),
      contentHash('rss-weekly-outside-window'),
      seedUuid(0, '02'),
    ],
  )
  await query(
    `/* seedRssFeedWeeklyWorkload.outsideWindowSource */
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
      SELECT $1, ids.id, items.published_at
      FROM rss_feed_item_guids ids
      JOIN rss_feed_items items ON items.id = ids.id
      WHERE ids.url_hostname_id = $2 AND ids.guid = 'seed-week-outside-window'
      ON CONFLICT DO NOTHING`,
    [seedUuid(0, '08'), seedUuid(0, '02')],
  )
  await query(
    `/* seedRssFeedWeeklyWorkload.outsideWindowCategory */
      INSERT INTO rss_feed_item_categories
        (rss_feed_item_id, category_identity_id, category_text, topic_id)
      SELECT ids.id, identity.id, identity.category_text, $1
      FROM rss_feed_item_guids ids
      JOIN rss_category_identities identity ON identity.category_text = 'seed-category-0'
      WHERE ids.url_hostname_id = $2 AND ids.guid = 'seed-week-outside-window'
      ON CONFLICT DO NOTHING`,
    [seedUuid(0, '04'), seedUuid(0, '02')],
  )
}
