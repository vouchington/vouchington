import assert from 'node:assert/strict'
import { STAGING_RSS_FEEDS } from './config-driven/utils/staging-rss-feeds.mts'
import { close, read } from './setup.mts'
import type { QueryValues } from './types.mts'

export type StagingFeedRow = {
  url: string
  slug: string
  is_enabled: boolean
  is_discoverable: boolean
}

type PublisherSlugRow = { slug: string }

export type StagingBootstrapReader = {
  readFeeds: (sql: string, values: QueryValues) => Promise<{ rows: StagingFeedRow[] }>
  readPublisherSlugs: (sql: string, values: QueryValues) => Promise<{ rows: PublisherSlugRow[] }>
}

const databaseReader: StagingBootstrapReader = {
  /* v8 ignore next -- live PostgreSQL adapter runs in the native fresh-staging CI CLI. */
  readFeeds: (sql, values) => read<StagingFeedRow>(sql, values),
  /* v8 ignore next -- live PostgreSQL adapter runs in the native fresh-staging CI CLI. */
  readPublisherSlugs: (sql, values) => read<PublisherSlugRow>(sql, values),
}

export function assertStagingRssBootstrap(
  feeds: readonly StagingFeedRow[],
  cloudflarePublisherSlugs: readonly string[],
): void {
  const expectedFeeds = STAGING_RSS_FEEDS.map(feed => ({
    url: feed.url,
    slug: feed.slug,
    is_enabled: true,
    is_discoverable: true,
  })).toSorted((a, b) => a.url.localeCompare(b.url))
  assert.deepEqual(feeds, expectedFeeds, 'Fresh staging bootstrap must seed every enabled RSS feed')
  assert.deepEqual(
    cloudflarePublisherSlugs,
    ['blog'],
    'Fresh staging bootstrap must relate the Cloudflare feed topic to blog',
  )
}

export async function checkStagingRssBootstrap(
  reader: StagingBootstrapReader = databaseReader,
): Promise<void> {
  const cloudflare = STAGING_RSS_FEEDS.find(feed => feed.hostname === 'blog.cloudflare.com')
  assert.ok(cloudflare, 'Expected the Cloudflare staging feed')
  const { rows: feeds } = await reader.readFeeds(
    `/* checkStagingRssBootstrap */
     SELECT u.url, t.slug, f.is_enabled, f.is_discoverable
     FROM rss_feeds f
     JOIN urls u ON u.id = f.rss_feed_url_id
     JOIN topics t ON t.id = f.topic_id
     WHERE u.url = ANY($1::text[]) AND f.deleted_at IS NULL AND t.deleted_at IS NULL
     ORDER BY u.url`,
    [STAGING_RSS_FEEDS.map(feed => feed.url)],
  )
  const { rows: publishers } = await reader.readPublisherSlugs(
    `/* checkStagingRssBootstrap */
     SELECT publisher.slug
     FROM topics source
     JOIN relation__topic__publisher_type__topic relation
       ON relation.subject_id = source.id AND relation.deleted_at IS NULL
     JOIN topics publisher ON publisher.id = relation.object_id AND publisher.deleted_at IS NULL
     WHERE source.slug = $1 AND source.deleted_at IS NULL
     ORDER BY publisher.slug`,
    [cloudflare.slug],
  )
  assertStagingRssBootstrap(
    feeds,
    publishers.map(row => row.slug),
  )
}

/* v8 ignore start -- direct CLI entry; the schema workflow runs this against a fresh staging database. */
if (import.meta.main) {
  try {
    await checkStagingRssBootstrap()
  } finally {
    await close()
  }
}
/* v8 ignore stop */
