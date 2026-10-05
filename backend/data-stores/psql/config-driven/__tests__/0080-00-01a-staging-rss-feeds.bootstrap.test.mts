import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginRolledBackSeedTransaction,
  readPublisherTypeSlugs,
  readSeededFeeds,
} from '../../../../test-helpers/data-stores/psql/staging-rss-feeds.mts'
import { runIsolatedDatabaseCase } from '../../../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../../../test-helpers/vitest-isolated-database-cases.mts'
import { STAGING_RSS_FEEDS } from '../0080-00-01a-staging-rss-feeds.mts'

describe('staging RSS feed seed on a fresh bootstrap', () => {
  afterEach(() => vi.unstubAllEnvs())

  // The config-driven files run in name order on a fresh database, in one pass. Only a fresh
  // database proves the seed runs before 0080-00-02-publisher-type-relations.sql: the shared
  // test database already holds the Cloudflare topic, so applying the files there tests nothing.
  it('gives the Cloudflare topic its blog publisher type in one bootstrap pass', async () => {
    if (getIsolatedDatabaseCaseMode('staging-rss-feed-publisher-type') === 'parent') {
      // The bootstrap child inherits this, so the generator emits its statements.
      vi.stubEnv('ENVIRONMENT', 'staging')
      await runIsolatedDatabaseCase('staging-rss-feed-publisher-type')
      return
    }
    await using tx = await beginRolledBackSeedTransaction()
    const feeds = await readSeededFeeds(
      tx,
      STAGING_RSS_FEEDS.map(feed => feed.url),
    )
    expect(feeds.map(feed => feed.slug).toSorted()).toEqual(
      STAGING_RSS_FEEDS.map(feed => feed.slug).toSorted(),
    )
    expect(feeds.every(feed => feed.is_enabled && feed.is_discoverable)).toBe(true)
    const cloudflare = STAGING_RSS_FEEDS.find(feed => feed.hostname === 'blog.cloudflare.com')!
    expect(await readPublisherTypeSlugs(tx, cloudflare.slug)).toEqual(['blog'])
  }, 240_000)
})
