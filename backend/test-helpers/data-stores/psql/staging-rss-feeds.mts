import { randomUUID } from 'node:crypto'
import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  loadSqlParserModule,
  splitSqlStatements,
} from '../../../data-stores/psql/migration-runner/sql-statements.mts'

// Package-local helpers for the staging RSS feed seed test. Every read and write goes through one
// borrowed transaction that the test rolls back, so the shared test database never keeps the
// seeded feeds (a committed, enabled, never-fetched feed would be picked up by other suites).
// Nothing here deletes or updates a row that already exists: tests share the database, so they
// seed only feeds the database lacks and read the rest.

export type SeededFeedRow = {
  url: string
  title: string
  topic_name: string
  slug: string
  aliases: string[]
  topic_type: string
  topic_hostname: string | null
  url_hostname: string
  hostname_topic_id: string | null
  mime_type: string
  search_params: unknown
  is_enabled: boolean
  is_discoverable: boolean
  created_via: string
  created_by_id: string | null
  feed_type: string
  enablement_creator: string | null
}

export type SeededRowCounts = Record<
  | 'hostnames'
  | 'urls'
  | 'topics'
  | 'aliases'
  | 'feeds'
  | 'enablementChanges'
  | 'discoverabilityChanges',
  number
>

export async function beginRolledBackSeedTransaction(): Promise<OwnedTransaction> {
  await loadSqlParserModule()
  return beginTransaction()
}

export async function applySeedSql(tx: OwnedTransaction, seedSql: string): Promise<void> {
  for (const statement of splitSqlStatements(seedSql)) await tx(statement)
}

// Another topic that already owns the URL's active feed, like a feed an operator created through
// the product. Its name and slug are random, so they never match the seed's natural keys.
export async function insertActiveFeedUnderOtherTopic(
  tx: OwnedTransaction,
  feed: { url: string; hostname: string; pathname: string },
): Promise<{ topicSlug: string }> {
  const label = randomUUID()
  const topicName = `Seed fixture ${label}`
  const topicSlug = `seed-fixture-${label}`
  await tx(sql`
    INSERT INTO media_types (mime_type)
    SELECT 'application/rss+xml'
    WHERE NOT EXISTS (SELECT 1 FROM media_types WHERE mime_type = 'application/rss+xml')
    ON CONFLICT DO NOTHING`)
  await tx(sql`
    INSERT INTO url_hostnames (hostname, is_crawlable)
    SELECT ${feed.hostname}, TRUE
    WHERE NOT EXISTS (SELECT 1 FROM url_hostnames WHERE hostname = ${feed.hostname})
    ON CONFLICT DO NOTHING`)
  await tx(sql`
    INSERT INTO urls (url, hostname_id, pathname, search_params, media_type_id)
    SELECT ${feed.url}, h.id, ${feed.pathname}, '{}'::jsonb, ct.id
    FROM url_hostnames h JOIN media_types ct ON ct.mime_type = 'application/rss+xml'
    WHERE h.hostname = ${feed.hostname} AND NOT EXISTS (SELECT 1 FROM urls WHERE url = ${feed.url})
    ON CONFLICT DO NOTHING`)
  await tx(sql`
    INSERT INTO topics (
      name, slug, topic_type, hostname_id, created_via, bedrock_nova_multimodal_v1_content_sha256
    )
    SELECT ${topicName}, ${topicSlug}, 'rss_feed', h.id, 'system',
      sha256(convert_to(${topicName}, 'UTF8'))
    FROM url_hostnames h WHERE h.hostname = ${feed.hostname}`)
  await tx(sql`
    INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, feed_type, created_via)
    SELECT u.id, t.id, ${topicName}, 'article', 'system'
    FROM urls u JOIN topics t ON t.slug = ${topicSlug}
    WHERE u.url = ${feed.url}`)
  return { topicSlug }
}

// Slugs of the publisher-type topics related to a topic, as relation__topic__publisher_type__topic
// stores them (config-driven/0080-00-02-publisher-type-relations.sql).
export async function readPublisherTypeSlugs(
  tx: OwnedTransaction,
  topicSlug: string,
): Promise<string[]> {
  const { rows } = await tx<{ slug: string }>(sql`
    SELECT p.slug
    FROM topics t
    JOIN relation__topic__publisher_type__topic r ON r.subject_id = t.id AND r.deleted_at IS NULL
    JOIN topics p ON p.id = r.object_id
    WHERE t.slug = ${topicSlug}
    ORDER BY p.slug`)
  return rows.map(row => row.slug)
}

export async function readSeededFeeds(
  tx: OwnedTransaction,
  urls: readonly string[],
): Promise<SeededFeedRow[]> {
  const { rows } = await tx<SeededFeedRow>(sql`
    SELECT u.url, f.title, t.name AS topic_name, t.slug, t.aliases, t.topic_type, th.hostname AS topic_hostname,
      h.hostname AS url_hostname, h.topic_id AS hostname_topic_id, ct.mime_type, u.search_params,
      f.is_enabled, f.is_discoverable, f.created_via, f.created_by_id, f.feed_type,
      (SELECT cu.username FROM rss_feed_setting_changes c
         JOIN users cu ON cu.id = c.changed_by_id
        WHERE c.change_type = 'enablement' AND c.rss_feed_id = f.id ORDER BY c.id LIMIT 1) AS enablement_creator
    FROM rss_feeds f
    JOIN urls u ON u.id = f.rss_feed_url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    JOIN media_types ct ON ct.id = u.media_type_id
    JOIN topics t ON t.id = f.topic_id
    LEFT JOIN url_hostnames th ON th.id = t.hostname_id
    WHERE u.url = ANY(${urls})
    ORDER BY u.url`)
  return rows
}

export async function countSeededRows(
  tx: OwnedTransaction,
  feeds: ReadonlyArray<{ url: string; hostname: string; slug: string }>,
): Promise<SeededRowCounts> {
  const urls = feeds.map(feed => feed.url)
  const hostnames = feeds.map(feed => feed.hostname)
  const slugs = feeds.map(feed => feed.slug)
  const { rows } = await tx<SeededRowCounts>(sql`
    SELECT
      (SELECT count(*)::int FROM url_hostnames WHERE hostname = ANY(${hostnames})) AS "hostnames",
      (SELECT count(*)::int FROM urls WHERE url = ANY(${urls})) AS "urls",
      (SELECT count(*)::int FROM topics WHERE slug = ANY(${slugs})) AS "topics",
      (SELECT count(*)::int FROM topic_aliases WHERE alias = ANY(${slugs})) AS "aliases",
      (SELECT count(*)::int FROM rss_feeds f JOIN urls u ON u.id = f.rss_feed_url_id
        WHERE u.url = ANY(${urls})) AS "feeds",
      (SELECT count(*)::int FROM rss_feed_setting_changes c
        JOIN rss_feeds f ON f.id = c.rss_feed_id JOIN urls u ON u.id = f.rss_feed_url_id
        WHERE c.change_type = 'enablement' AND u.url = ANY(${urls})) AS "enablementChanges",
      (SELECT count(*)::int FROM rss_feed_setting_changes c
        JOIN rss_feeds f ON f.id = c.rss_feed_id JOIN urls u ON u.id = f.rss_feed_url_id
        WHERE c.change_type = 'discoverability' AND u.url = ANY(${urls})) AS "discoverabilityChanges"`)
  return rows[0]!
}

// A later change, like the product's updateRssFeedById: a default uuidv7() id sorts after the
// seed's fixed id, so the AFTER INSERT sync trigger makes it the feed's current state.
export async function appendEnablementChange(
  tx: OwnedTransaction,
  url: string,
  enabled: boolean,
): Promise<void> {
  await tx(sql`
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    SELECT 'enablement'::rss_feed_setting_change_types, f.id, ${enabled}, 'test'
    FROM rss_feeds f JOIN urls u ON u.id = f.rss_feed_url_id
    WHERE u.url = ${url}`)
}
