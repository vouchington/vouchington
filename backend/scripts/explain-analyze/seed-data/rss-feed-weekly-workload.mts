import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import {
  contentHash,
  FEED_URL_COUNT,
  ITEM_URL_POOL,
  postSeedTimestampMs,
  seedUuid,
} from './common.mts'
import {
  RSS_FEED_WEEKLY_WORKLOAD_OUTSIDE_TOKEN,
  seedRssFeedWeeklyOutsideWindow,
} from './rss-feed-weekly-outside-window.mts'

export const RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT = 10_000
export const RSS_FEED_WEEKLY_WORKLOAD_RARE_TOKEN = 'rssweekneedle'
export const RSS_FEED_WEEKLY_STORY_ITEM_COUNT = 1_000
export const RSS_FEED_WEEKLY_STORY_ID = seedUuid(200_001, '17')
export const RSS_FEED_WEEKLY_STORY_TOKEN = 'rssweekstory'
export const RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT = 200
export { RSS_FEED_WEEKLY_WORKLOAD_OUTSIDE_TOKEN }

const URL_ID_PREFIX = seedUuid(FEED_URL_COUNT, '03').slice(0, -12)
const URL_HOSTNAME_PREFIX = seedUuid(0, '02').slice(0, -12)
const RSS_FEED_PREFIX = seedUuid(0, '08').slice(0, -12)
const TOPIC_PREFIX = seedUuid(0, '04').slice(0, -12)

/** Adds a six-day, minute-spaced cohort on the 200 sources/topics heavyFollowUser follows. */
export async function seedRssFeedWeeklyWorkload(): Promise<void> {
  console.log(
    `Seeding ${RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT.toLocaleString()} recent personalized RSS workload items...`,
  )
  await using transaction = await beginTransaction()
  await insertStory(transaction)
  await insertItemIdentities(transaction)
  await insertItems(transaction)
  await attachStoryMembers(transaction)
  await insertSources(transaction)
  await insertCategories(transaction)
  await seedRssFeedWeeklyOutsideWindow(transaction)
  await transaction.commit()
}

async function insertStory(query: TransactionQuery): Promise<void> {
  await query(
    `/* seedRssFeedWeeklyWorkload.story */
      INSERT INTO stories (id, title)
      VALUES ($1, 'EXPLAIN RSS weekly story skew')
      ON CONFLICT (id) DO NOTHING`,
    [RSS_FEED_WEEKLY_STORY_ID],
  )
}

async function attachStoryMembers(query: TransactionQuery): Promise<void> {
  await query(
    `/* seedRssFeedWeeklyWorkload.storyMembers */
      UPDATE rss_feed_items items
      SET story_id = $1
      FROM generate_series(0, $2 - 1) AS series
      JOIN rss_feed_item_guids ids
        ON ids.url_hostname_id = ($3 || lpad(to_hex(series % $4), 12, '0'))::uuid
       AND ids.guid = 'seed-week-dense-item-' || series::text
      WHERE items.id = ids.id AND items.story_id IS DISTINCT FROM $1::uuid`,
    [
      RSS_FEED_WEEKLY_STORY_ID,
      RSS_FEED_WEEKLY_STORY_ITEM_COUNT,
      URL_HOSTNAME_PREFIX,
      RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
    ],
  )
}

async function insertItemIdentities(query: TransactionQuery): Promise<void> {
  await query(
    `/* seedRssFeedWeeklyWorkload.identities */
      INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
      SELECT
        ($2 || lpad(to_hex(series % $3), 12, '0'))::uuid,
        'seed-week-dense-item-' || series::text
      FROM generate_series(0, $1 - 1) AS series
      ON CONFLICT (url_hostname_id, guid) DO NOTHING`,
    [
      RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT,
      URL_HOSTNAME_PREFIX,
      RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
    ],
  )
}

async function insertItems(query: TransactionQuery): Promise<void> {
  const anchor = new Date(postSeedTimestampMs(0)).toISOString()
  await query(
    `/* seedRssFeedWeeklyWorkload.items */
      INSERT INTO rss_feed_items
        (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
      SELECT ids.id,
        ($2 || lpad(to_hex($3 + series % $4), 12, '0'))::uuid,
        jsonb_build_object(
          'title', CASE
            WHEN series < $5 THEN $6 || ' member ' || series::text
            WHEN series >= $1 - 2 THEN $7 || ' ' || series::text
            ELSE 'Dense weekly RSS item ' || series::text END,
          'link', 'https://example.com/rss-week-dense-' || series::text,
          'isoDate', to_char(
            ($8::timestamptz - CASE
              WHEN series < $5 THEN ($5 - series) * INTERVAL '1 minute'
              ELSE series * INTERVAL '1 minute'
            END) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          )
        ),
        $9
      FROM generate_series(0, $1 - 1) AS series
      JOIN rss_feed_item_guids ids
        ON ids.url_hostname_id = ($10 || lpad(to_hex(series % $11), 12, '0'))::uuid
       AND ids.guid = 'seed-week-dense-item-' || series::text
      ON CONFLICT (id) DO NOTHING`,
    [
      RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT,
      URL_ID_PREFIX,
      FEED_URL_COUNT,
      ITEM_URL_POOL,
      RSS_FEED_WEEKLY_STORY_ITEM_COUNT,
      RSS_FEED_WEEKLY_STORY_TOKEN,
      RSS_FEED_WEEKLY_WORKLOAD_RARE_TOKEN,
      anchor,
      contentHash('rss-weekly-workload'),
      URL_HOSTNAME_PREFIX,
      RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
    ],
  )
}

async function insertSources(query: TransactionQuery): Promise<void> {
  await query(
    `/* seedRssFeedWeeklyWorkload.sources */
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
      SELECT
        ($2 || lpad(to_hex(series % $5), 12, '0'))::uuid,
        ids.id,
        items.published_at
      FROM generate_series(0, $1 - 1) AS series
      JOIN rss_feed_item_guids ids
        ON ids.url_hostname_id = ($3 || lpad(to_hex(series % $4), 12, '0'))::uuid
       AND ids.guid = 'seed-week-dense-item-' || series::text
      JOIN rss_feed_items items ON items.id = ids.id
      ON CONFLICT DO NOTHING`,
    [
      RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT,
      RSS_FEED_PREFIX,
      URL_HOSTNAME_PREFIX,
      RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
      RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
    ],
  )
}

async function insertCategories(query: TransactionQuery): Promise<void> {
  await query(
    `/* seedRssFeedWeeklyWorkload.categories */
      INSERT INTO rss_feed_item_categories
        (rss_feed_item_id, category_identity_id, category_text, topic_id)
      SELECT ids.id, identity.id, identity.category_text,
        ($2 || lpad(to_hex(series % $5), 12, '0'))::uuid
      FROM generate_series(0, $1 - 1) AS series
      JOIN rss_feed_item_guids ids
        ON ids.url_hostname_id = ($3 || lpad(to_hex(series % $4), 12, '0'))::uuid
       AND ids.guid = 'seed-week-dense-item-' || series::text
      JOIN rss_category_identities identity
        ON identity.category_text = 'seed-category-' || (series % $5)::text
      ON CONFLICT DO NOTHING`,
    [
      RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT,
      TOPIC_PREFIX,
      URL_HOSTNAME_PREFIX,
      RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
      RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
    ],
  )
}
