import { createTopicEmbeddingContent } from '@voucha/types/entities/topic'

/**
 * Everything the product writes when it creates an RSS feed source for one feed URL
 * (`createRssFeedSource`), with fixed UUIDv7 ids. `urls.url`, `pathname` and the slug are the
 * values `normalizeUrlForUrlTable` and `generateSourceDetails` produce, pinned by the test.
 * The ids carry a timestamp from before any real change row, so a later `uuidv7()` enablement
 * change always sorts after the initial one (the sync triggers read `ORDER BY id DESC`).
 *
 * The runner applies config-driven files in name order, in one pass. This file's prefix sorts
 * after 0080-00-01-publisher-type-topics.mts and before 0080-00-02-publisher-type-relations.sql,
 * so the Cloudflare topic exists when that file relates it to its `blog` publisher type.
 */
export type StagingRssFeed = {
  readonly url: string
  readonly hostname: string
  readonly pathname: string
  readonly title: string
  readonly slug: string
  readonly ids: {
    readonly hostname: string
    readonly url: string
    readonly topic: string
    readonly alias: string
    readonly feed: string
    readonly enablement: string
    readonly discoverability: string
  }
}

export const STAGING_RSS_FEEDS: readonly StagingRssFeed[] = [
  {
    url: 'https://www.theguardian.com/science/rss',
    hostname: 'www.theguardian.com',
    pathname: '/science/rss',
    title: 'The Guardian Science',
    slug: 'the-guardian-science-theguardian-com-science-rss',
    ids: {
      hostname: '01a0f4c2-c400-7692-aa38-ab180ba72f58',
      url: '01a0f4c2-c400-7be6-a84f-a5327e9babf4',
      topic: '01a0f4c2-c400-7bb6-af71-80c063f930e2',
      alias: '01a0f4c2-c400-73b6-a97e-430ebbebc265',
      feed: '01a0f4c2-c400-73df-a7c1-edb8b8ed9c49',
      enablement: '01a0f4c2-c400-7956-90fb-f4a11c5b8b23',
      discoverability: '01a0f4c2-c400-7429-b5dc-124ed59cd83b',
    },
  },
  {
    url: 'https://blog.cloudflare.com/rss/',
    hostname: 'blog.cloudflare.com',
    pathname: '/rss/',
    title: 'Cloudflare Blog',
    slug: 'cloudflare-blog-blog-cloudflare-com-rss',
    ids: {
      hostname: '01a0f4c2-c400-76eb-aec6-0e1194d6ec35',
      url: '01a0f4c2-c400-7034-9cac-c533d92746c2',
      topic: '01a0f4c2-c400-7010-89ad-d299c6ba91f5',
      alias: '01a0f4c2-c400-7d65-8f4d-a88bd4a9c51a',
      feed: '01a0f4c2-c400-78bb-a113-060eddca3e66',
      enablement: '01a0f4c2-c400-74f9-80d0-907dce8e7df8',
      discoverability: '01a0f4c2-c400-79af-87f1-57593fa02deb',
    },
  },
  {
    url: 'https://www.quantamagazine.org/feed/',
    hostname: 'www.quantamagazine.org',
    pathname: '/feed/',
    title: 'Quanta Magazine',
    slug: 'quanta-magazine-quantamagazine-org-feed',
    ids: {
      hostname: '01a0f4c2-c400-757d-840b-e651ee1ae676',
      url: '01a0f4c2-c400-7ba6-b137-8efb0ffbf089',
      topic: '01a0f4c2-c400-71fd-bc96-fe4899ecc16a',
      alias: '01a0f4c2-c400-7398-86e0-0d09b31e65a3',
      feed: '01a0f4c2-c400-71a8-809a-48f50e68fba7',
      enablement: '01a0f4c2-c400-7704-9390-83b64402efb8',
      discoverability: '01a0f4c2-c400-7d51-bfb9-56618d6805cb',
    },
  },
]

const RSS_MIME_TYPE = 'application/rss+xml'
const AUTO_UPDATER_USERNAME = 'rss-feed-auto-updater'

// The product names a feed source's topic `${title} (${url})` (buildSourceTopicName); the slug
// and rss_feeds.title use the bare feed title.
const sourceTopicName = (feed: StagingRssFeed): string => `${feed.title} (${feed.url})`

const lit = (value: string): string => `'${value.replaceAll("'", "''")}'`

// rss_feeds allows one active feed per URL (idx_rss_feeds__rss_feed_url_id), so a topic or alias
// created while another topic already owns the URL's feed would point at no feed at all.
const noActiveFeedForUrl = (feed: StagingRssFeed): string => `NOT EXISTS (
    SELECT 1 FROM rss_feeds f JOIN urls u ON u.id = f.rss_feed_url_id
    WHERE u.url = ${lit(feed.url)} AND f.deleted_at IS NULL
  )`

// Every statement is one insert-only INSERT: a bare `ON CONFLICT DO NOTHING` (the fixed-id key,
// and the unique indexes on topics and rss_feeds) plus a NOT EXISTS so a rerun, and a row that
// was soft-deleted or disabled after seeding, is never recreated or re-enabled. Parents are
// joined by natural key, so a missing parent inserts nothing.
function feedStatements(feed: StagingRssFeed): string[] {
  const { ids } = feed
  const topicName = sourceTopicName(feed)
  const sha256 = createTopicEmbeddingContent({ name: topicName }).content_sha256.toString('hex')
  const changeInsert = (kind: 'enablement' | 'discoverability', id: string): string => `
INSERT INTO rss_feed_setting_changes (id, rss_feed_id, change_type, enabled, changed_by_id, reason)
SELECT ${lit(id)}, f.id, ${lit(kind)}::rss_feed_setting_change_types, TRUE,
  (SELECT u.id FROM users u
    WHERE u.username = ${lit(AUTO_UPDATER_USERNAME)} AND u.platform_account_kind = 'system'),
  'initial state'
FROM rss_feeds f
WHERE f.id = ${lit(ids.feed)}
  AND NOT EXISTS (SELECT 1 FROM rss_feed_setting_changes c WHERE c.rss_feed_id = f.id AND c.change_type = ${lit(kind)}::rss_feed_setting_change_types)
ON CONFLICT DO NOTHING;`

  return [
    `
INSERT INTO url_hostnames (id, hostname, crawlable)
SELECT ${lit(ids.hostname)}, ${lit(feed.hostname)}, TRUE
WHERE NOT EXISTS (SELECT 1 FROM url_hostnames WHERE hostname = ${lit(feed.hostname)})
ON CONFLICT DO NOTHING;`,
    `
INSERT INTO urls (id, url, hostname_id, pathname, search_params, media_type_id)
SELECT ${lit(ids.url)}, ${lit(feed.url)}, h.id, ${lit(feed.pathname)}, '{}'::jsonb, ct.id
FROM url_hostnames h
JOIN media_types ct ON ct.mime_type = ${lit(RSS_MIME_TYPE)}
WHERE h.hostname = ${lit(feed.hostname)}
  AND NOT EXISTS (SELECT 1 FROM urls WHERE url = ${lit(feed.url)})
ON CONFLICT DO NOTHING;`,
    // aliases is set here instead of by the product's follow-up UPDATE: same end state, insert-only.
    // topics.hostname_id only; url_hostnames.topic_id stays NULL (that column means a whole domain).
    `
INSERT INTO topics (
  id, name, slug, topic_type, aliases, hostname_id, created_via,
  bedrock_nova_multimodal_v1_content_sha256
)
SELECT ${lit(ids.topic)}, ${lit(topicName)}, ${lit(feed.slug)}, 'rss_feed',
  ARRAY[${lit(feed.slug)}], h.id, 'system', decode(${lit(sha256)}, 'hex')
FROM url_hostnames h
WHERE h.hostname = ${lit(feed.hostname)}
  AND NOT EXISTS (
    SELECT 1 FROM topics
    WHERE id = ${lit(ids.topic)} OR slug = ${lit(feed.slug)} OR lower(name) = lower(${lit(topicName)})
  )
  AND NOT EXISTS (SELECT 1 FROM topic_aliases WHERE alias = ${lit(feed.slug)})
  AND ${noActiveFeedForUrl(feed)}
ON CONFLICT DO NOTHING;`,
    // Only while topics.aliases still lists the slug, so an alias removed later is not resurrected
    // out of sync with topics.aliases.
    `
INSERT INTO topic_aliases (id, topic_id, alias)
SELECT ${lit(ids.alias)}, t.id, ${lit(feed.slug)}
FROM topics t
WHERE t.id = ${lit(ids.topic)}
  AND ${lit(feed.slug)} = ANY(t.aliases)
  AND NOT EXISTS (SELECT 1 FROM topic_aliases WHERE alias = ${lit(feed.slug)})
  AND ${noActiveFeedForUrl(feed)}
ON CONFLICT DO NOTHING;`,
    `
INSERT INTO rss_feeds (id, rss_feed_url_id, topic_id, title, feed_type, created_via)
SELECT ${lit(ids.feed)}, u.id, t.id, ${lit(feed.title)}, 'article', 'system'
FROM urls u
JOIN topics t ON t.id = ${lit(ids.topic)} AND t.deleted_at IS NULL
WHERE u.url = ${lit(feed.url)}
  AND NOT EXISTS (SELECT 1 FROM rss_feeds WHERE id = ${lit(ids.feed)})
ON CONFLICT DO NOTHING;`,
    // The initial enabled=TRUE rows are what set rss_feeds.is_enabled / is_discoverable (AFTER
    // INSERT sync triggers). Inserted only while the feed has no change row at all.
    changeInsert('enablement', ids.enablement),
    changeInsert('discoverability', ids.discoverability),
  ]
}

/** @public loaded by path by the config-driven migration runner */
export default function generateStagingRssFeedsSQL(
  environment: string | undefined = process.env.ENVIRONMENT,
): string {
  if (environment !== 'staging') return ''
  return [
    '-- Staging only: seed a few RSS feeds the way createRssFeedSource writes them',
    `
INSERT INTO media_types (mime_type)
SELECT ${lit(RSS_MIME_TYPE)}
WHERE NOT EXISTS (SELECT 1 FROM media_types WHERE mime_type = ${lit(RSS_MIME_TYPE)})
ON CONFLICT DO NOTHING;`,
    ...STAGING_RSS_FEEDS.flatMap(feedStatements),
  ].join('\n')
}
