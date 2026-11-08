import { write } from '@data-stores/psql'
import { paginationMaxima } from '@services/pagination/config'
import { rssFeedItemsWorkMaxValues } from '@services/rss-feed-items/work-limits'
import { TOP_URLS_PER_HOSTNAME } from '@services/urls-hostnames/top-urls'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

export const TOP_URL_HOST_COUNT = paginationMaxima.max_limit
export const TOP_URL_BATCH = rssFeedItemsWorkMaxValues.sql_batch_size
export const TOP_URL_HOT_COUNT = TOP_URL_BATCH * 2
export const TOP_URL_OTHER_COUNT = TOP_URLS_PER_HOSTNAME * 2
export const TOP_URL_COUNT = TOP_URL_HOT_COUNT + (TOP_URL_HOST_COUNT - 1) * TOP_URL_OTHER_COUNT
export const TOP_URL_HOT = seedUuid(0, 'f2')
export const TOP_URL_MOVE_TARGET = seedUuid(1, 'f2')
export const TOP_URL_FEED = seedUuid(0, 'f4')
export const TOP_URL_TOPIC = seedUuid(0, 'f5')
export const TOP_URL_INSERT_ITEM = seedUuid(TOP_URL_COUNT, 'f3')
export const TOP_URL_EMPTY_HOST = seedUuid(TOP_URL_HOST_COUNT, 'f1')
const OLD_YEARS = [2001, 2002] as const
export const TOP_URL_PARTITION_COUNT = 1 + OLD_YEARS.length

export function topUrlHostId(index: number): string {
  return seedUuid(index, 'f1')
}

export function topUrlItemId(index: number): string {
  return seedUuid(index, 'f3')
}

export function topUrlOldItemId(year: (typeof OLD_YEARS)[number], index: number): string {
  return seedUuidAtTimestamp(Date.UTC(year, 0, 1) + index * 60_000, index)
}

/** All rows have real identity/FK and publication triggers; no URL cache field is written. */
export async function seedTopUrlRanking(): Promise<void> {
  for (const year of OLD_YEARS) {
    const child = `rss_feed_items__p_${year}_01`
    await write(`/* seedTopUrlRanking.partition */ CREATE TABLE IF NOT EXISTS ${child}
      PARTITION OF rss_feed_items FOR VALUES FROM ('${topUrlOldItemId(year, 0)}')
      TO ('${seedUuidAtTimestamp(Date.UTC(year, 1, 1), 0)}')`)
  }
  await write(
    `/* seedTopUrlRanking.hostnames */ INSERT INTO url_hostnames (id, hostname)
    SELECT ($1 || lpad(to_hex(i), 12, '0'))::uuid,
      'top-url-' || i || '.explain.test'
    FROM generate_series(0, $2) AS i ON CONFLICT (id) DO NOTHING`,
    [seedUuid(0, 'f1').slice(0, -12), TOP_URL_HOST_COUNT],
  )
  await write(
    `/* seedTopUrlRanking.urls */ INSERT INTO urls
    (id, url, hostname_id, pathname, search_params)
    SELECT ($1 || lpad(to_hex(i), 12, '0'))::uuid,
      'https://top-url-' || host_i || '.explain.test/' || i,
      ($2 || lpad(to_hex(host_i), 12, '0'))::uuid, '/' || i, '{}'::jsonb
    FROM generate_series(0, $3 - 1) AS i
    CROSS JOIN LATERAL (SELECT CASE WHEN i < $4 THEN 0
      ELSE 1 + (i - $4) / $5 END AS host_i) AS h
    ON CONFLICT (id) DO NOTHING`,
    [
      seedUuid(0, 'f2').slice(0, -12),
      seedUuid(0, 'f1').slice(0, -12),
      TOP_URL_COUNT,
      TOP_URL_HOT_COUNT,
      TOP_URL_OTHER_COUNT,
    ],
  )
  await seedTopUrlFeed()
  await seedTopUrlItems()
  await write(
    `/* seedTopUrlRanking.insertGuid */ INSERT INTO rss_feed_item_guids
    (id, url_hostname_id, guid) VALUES ($1, $2, 'top-url-insert-probe')
    ON CONFLICT (id) DO NOTHING`,
    [TOP_URL_INSERT_ITEM, topUrlHostId(0)],
  )
  await write(`/* seedTopUrlRanking.analyze */ ANALYZE url_hostnames, urls,
    rss_feed_item_guids, rss_feed_items`)
}

async function seedTopUrlFeed(): Promise<void> {
  await write(
    `/* seedTopUrlRanking.topic */ INSERT INTO topics
    (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    VALUES ($1, 'Top URL EXPLAIN feed', 'top-url-explain-feed', 'system',
      decode(repeat('d4', 32), 'hex')) ON CONFLICT (id) DO NOTHING`,
    [TOP_URL_TOPIC],
  )
  await write(
    `/* seedTopUrlRanking.feed */ INSERT INTO rss_feeds
    (id, rss_feed_url_id, topic_id, title, created_via)
    VALUES ($1, $2, $3, 'Top URL EXPLAIN feed', 'system')
    ON CONFLICT (id) DO NOTHING`,
    [TOP_URL_FEED, TOP_URL_MOVE_TARGET, TOP_URL_TOPIC],
  )
  await write(
    `/* seedTopUrlRanking.feedEnablement */ INSERT INTO rss_feed_setting_changes
    (change_type, rss_feed_id, is_enabled, reason)
    SELECT 'enablement', $1, TRUE, 'top URL EXPLAIN fixture'
    WHERE NOT EXISTS (SELECT 1 FROM rss_feed_setting_changes
      WHERE rss_feed_id = $1 AND change_type = 'enablement')`,
    [TOP_URL_FEED],
  )
}

async function seedTopUrlItems(): Promise<void> {
  // An ordinary item on every URL gives realistic fallback and dense ranking ties.
  await write(
    `/* seedTopUrlRanking.currentGuids */ INSERT INTO rss_feed_item_guids
    (id, url_hostname_id, guid)
    SELECT ($1 || lpad(to_hex(i), 12, '0'))::uuid,
      ($2 || lpad(to_hex(CASE WHEN i < $4 THEN 0 ELSE 1 + (i - $4) / $5 END), 12, '0'))::uuid,
      'top-url-current-' || i
    FROM generate_series(0, $3 - 1) AS i ON CONFLICT (id) DO NOTHING`,
    [
      seedUuid(0, 'f3').slice(0, -12),
      seedUuid(0, 'f1').slice(0, -12),
      TOP_URL_COUNT,
      TOP_URL_HOT_COUNT,
      TOP_URL_OTHER_COUNT,
    ],
  )
  await write(
    `/* seedTopUrlRanking.currentItems */ INSERT INTO rss_feed_items
    (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
    SELECT ($1 || lpad(to_hex(i), 12, '0'))::uuid,
      ($2 || lpad(to_hex(i), 12, '0'))::uuid,
      jsonb_build_object('title', 'Top URL ' || i,
        'isoDate', '2026-01-01T00:00:00Z'), decode(repeat('a1', 32), 'hex')
    FROM generate_series(0, $3 - 1) AS i ON CONFLICT (id) DO NOTHING`,
    [seedUuid(0, 'f3').slice(0, -12), seedUuid(0, 'f2').slice(0, -12), TOP_URL_COUNT],
  )
  for (const year of OLD_YEARS) {
    // UUIDv7 identity timestamps place each cohort in its owned monthly partition.
    const ids = Array.from({ length: TOP_URL_BATCH }, (_, index) => topUrlOldItemId(year, index))
    // no-mistakes-disable-next-line query-reached-per-item: two fixed historical partitions each receive one set-based batch capped by the RSS SQL batch maximum.
    await write(
      `/* seedTopUrlRanking.oldGuids */ INSERT INTO rss_feed_item_guids
        (id, url_hostname_id, guid)
        SELECT id, $2, 'top-url-' || $3 || '-' || id::text
        FROM unnest($1::uuid[]) AS rows(id)
        ON CONFLICT (id) DO NOTHING`,
      [ids, topUrlHostId(0), year],
    )
    // no-mistakes-disable-next-line query-reached-per-item: two fixed historical partitions each receive one set-based batch capped by the RSS SQL batch maximum.
    await write(
      `/* seedTopUrlRanking.oldItems */ INSERT INTO rss_feed_items
        (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
        SELECT id, $2, jsonb_build_object('title', 'Old top URL item',
          'isoDate', $3::text), decode(repeat('b2', 32), 'hex')
        FROM unnest($1::uuid[]) AS rows(id) ON CONFLICT (id) DO NOTHING`,
      [ids, TOP_URL_HOT, `${year}-01-01T00:00:00Z`],
    )
  }
}

export async function cleanupTopUrlRanking(): Promise<void> {
  const hostIds = Array.from({ length: TOP_URL_HOST_COUNT + 1 }, (_, index) => topUrlHostId(index))
  // Host ownership cascades through URLs and GUIDs to items, without a shared-corpus scan.
  await write(
    `/* cleanupTopUrlRanking.hosts */ DELETE FROM url_hostnames WHERE id = ANY($1::uuid[])`,
    [hostIds],
  )
  await write(`/* cleanupTopUrlRanking.topic */ DELETE FROM topics WHERE id = $1`, [TOP_URL_TOPIC])
  await write(
    `/* cleanupTopUrlRanking.topicIdentity */ DELETE FROM retained_topic_identities
    WHERE id = $1`,
    [TOP_URL_TOPIC],
  )
  const itemIds = [
    ...Array.from({ length: TOP_URL_COUNT }, (_, index) => topUrlItemId(index)),
    ...OLD_YEARS.flatMap(year =>
      Array.from({ length: TOP_URL_BATCH }, (_, index) => topUrlOldItemId(year, index)),
    ),
  ]
  await write(
    `/* cleanupTopUrlRanking.retained */ DELETE FROM retained_rss_feed_item_identities
    WHERE id = ANY($1::uuid[])`,
    [itemIds],
  )
  for (const year of OLD_YEARS) {
    const child = `rss_feed_items__p_${year}_01`
    await write(
      `/* cleanupTopUrlRanking.detach */ ALTER TABLE rss_feed_items DETACH PARTITION ${child}`,
    )
    await write(`/* cleanupTopUrlRanking.drop */ DROP TABLE ${child}`)
  }
  await write(`/* cleanupTopUrlRanking.analyze */ ANALYZE url_hostnames, urls,
    rss_feed_item_guids, rss_feed_items`)
}
