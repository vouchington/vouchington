import { createSlugFromTitle, normalizeUrlForUrlTable } from '@modules/utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule, splitSqlStatements } from '../../migration-runner/sql-statements.mts'
import { findFirstGeneratedDdlViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-guard-helpers.mts'
import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'
import { findFirstUuidv7CreatedAtViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-schema-invariants.mts'
import { stripSqlComments } from '../../../../test-helpers/data-stores/psql/config-driven/sql-text-scanner-helpers.mts'
import {
  appendEnablementChange,
  applySeedSql,
  beginRolledBackSeedTransaction,
  countSeededRows,
  createStagingRssFeedFixture,
  insertActiveFeedUnderOtherTopic,
  readSeededFeeds,
} from '../../../../test-helpers/data-stores/psql/staging-rss-feeds.mts'
import generateStagingRssFeedsSQL from '../0080-00-01a-staging-rss-feeds.mts'
import { STAGING_RSS_FEEDS, type StagingRssFeed } from '../utils/staging-rss-feeds.mts'

// The three feeds the staging decision names (vouchington/vouchington#1956).
const GUARDIAN_URL = 'https://www.theguardian.com/science/rss'
const CLOUDFLARE_URL = 'https://blog.cloudflare.com/rss/'
const QUANTA_URL = 'https://www.quantamagazine.org/feed/'
const SPEC_FEED_URLS = [GUARDIAN_URL, CLOUDFLARE_URL, QUANTA_URL]
const urls = STAGING_RSS_FEEDS.map(feed => feed.url)
const loadSqlTooling = () => Promise.all([loadSqlParserModule(), initSqlAst()])

describe('0080-00-01a-staging-rss-feeds environment gate', () => {
  beforeAll(loadSqlTooling)
  afterEach(() => vi.unstubAllEnvs())

  it.each([undefined, 'production', 'development', 'test', ''])(
    'emits no statements when ENVIRONMENT is %j',
    environment => {
      // An explicit undefined falls back to process.env.ENVIRONMENT, so leave that unset.
      vi.stubEnv('ENVIRONMENT', undefined)
      expect(splitSqlStatements(generateStagingRssFeedsSQL(environment))).toEqual([])
    },
  )

  it('reads ENVIRONMENT from the process when called without an argument', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    expect(generateStagingRssFeedsSQL()).toBe('')
    vi.stubEnv('ENVIRONMENT', 'staging')
    expect(generateStagingRssFeedsSQL()).toBe(generateStagingRssFeedsSQL('staging'))
    expect(generateStagingRssFeedsSQL()).not.toBe('')
  })

  it('only promotes hostname visibility in addition to insert-only feed statements', async () => {
    const statements = splitSqlStatements(stripSqlComments(generateStagingRssFeedsSQL('staging')))
    expect(statements.length).toBeGreaterThan(0)
    const hostnamePromotions = statements.filter(statement => /^\s*UPDATE\b/i.test(statement))
    expect(hostnamePromotions).toHaveLength(STAGING_RSS_FEEDS.length)
    for (const statement of hostnamePromotions) {
      expect(statement.trim()).toMatch(
        /^UPDATE url_hostnames SET publicly_introduced_at = COALESCE\(publicly_introduced_at, CURRENT_TIMESTAMP\)\s+WHERE hostname = '[^']+' AND publicly_introduced_at IS NULL$/i,
      )
    }
    for (const statement of statements.filter(
      statement => !hostnamePromotions.includes(statement),
    )) {
      expect(statement).toMatch(/^\s*INSERT INTO /i)
    }
    expect(statements.join('\n')).not.toMatch(/DO UPDATE|\bDELETE\b/i)
  })
})

describe('0080-00-01a-staging-rss-feeds feed list', () => {
  it('seeds exactly the three feeds the staging decision names', async () => {
    expect(urls).toEqual(SPEC_FEED_URLS)
  })

  it('stores each feed the way the product normalises and slugs it', async () => {
    for (const feed of STAGING_RSS_FEEDS) {
      const normalized = normalizeUrlForUrlTable(feed.url)
      expect(normalized.href).toBe(feed.url)
      expect(normalized.hostname).toBe(feed.hostname)
      expect(normalized.pathname).toBe(feed.pathname)
      const urlPart = feed.url
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
        .replaceAll(/[./=?&#]/g, ' ')
      expect(createSlugFromTitle(`${feed.title} ${urlPart}`, 250)).toBe(feed.slug)
    }
  })

  it('gives every row a distinct UUIDv7 id from before any real change row', async () => {
    const ids = STAGING_RSS_FEEDS.flatMap(feed => Object.values(feed.ids))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^01a0f4c2-c400-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-/)
  })
})

describe('0080-00-01a-staging-rss-feeds generated SQL guards', () => {
  beforeAll(loadSqlTooling)
  const stagingSql = generateStagingRssFeedsSQL('staging')

  it('passes the generated-DDL guard', async () => {
    expect(await findFirstGeneratedDdlViolation(stagingSql)).toBeNull()
  })

  it('passes the UUIDv7 created_at guard', async () => {
    expect(await findFirstUuidv7CreatedAtViolation(stagingSql)).toBeNull()
  })

  it('passes the re-runnable INSERT guard', async () => {
    expect(await findFirstUnguardedInsertViolation(stagingSql)).toBeNull()
  })
})

describe('0080-00-01a-staging-rss-feeds applied to the database', () => {
  let feeds: StagingRssFeed[]
  let feedUrls: string[]
  let stagingSql: string

  beforeEach(() => {
    feeds = [createStagingRssFeedFixture(), createStagingRssFeedFixture()]
    feedUrls = feeds.map(feed => feed.url)
    stagingSql = generateStagingRssFeedsSQL('staging', feeds)
  })
  const expectedCounts = {
    hostnames: 2,
    urls: 2,
    topics: 2,
    aliases: 2,
    feeds: 2,
    enablementChanges: 2,
    discoverabilityChanges: 2,
  }

  it('creates an enabled, discoverable feed with a topic, hostname and URL for each new feed', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    await applySeedSql(tx, stagingSql)

    const storedFeeds = await readSeededFeeds(tx, feedUrls)
    expect(storedFeeds.map(feed => feed.url)).toEqual(feedUrls.toSorted())
    for (const feed of storedFeeds) {
      const seeded = feeds.find(candidate => candidate.url === feed.url)!
      expect(feed).toMatchObject({
        title: seeded.title,
        topic_name: `${seeded.title} (${seeded.url})`,
        slug: seeded.slug,
        aliases: [seeded.slug],
        topic_type: 'rss_feed',
        topic_hostname: seeded.hostname,
        url_hostname: seeded.hostname,
        hostname_topic_id: null,
        mime_type: 'application/rss+xml',
        search_params: {},
        is_enabled: true,
        is_discoverable: true,
        created_via: 'system',
        created_by_id: null,
        feed_type: 'article',
        enablement_creator: 'rss-feed-auto-updater',
      })
    }
    expect(await countSeededRows(tx, feeds)).toEqual(expectedCounts)
  })

  it('changes no row when applied a second time', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    await applySeedSql(tx, stagingSql)
    const firstFeeds = await readSeededFeeds(tx, feedUrls)
    expect(await countSeededRows(tx, feeds)).toEqual(expectedCounts)

    await applySeedSql(tx, stagingSql)

    expect(await countSeededRows(tx, feeds)).toEqual(expectedCounts)
    expect(await readSeededFeeds(tx, feedUrls)).toEqual(firstFeeds)
  })

  it('leaves a feed that already exists for the same natural keys untouched', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    const existingFeed = { ...feeds[0]!, ids: createStagingRssFeedFixture().ids }
    await applySeedSql(tx, generateStagingRssFeedsSQL('staging', [existingFeed]))
    const before = await readSeededFeeds(tx, feedUrls)

    await applySeedSql(tx, stagingSql)

    const after = await readSeededFeeds(tx, feedUrls)
    expect(after.map(feed => feed.url)).toEqual(feedUrls.toSorted())
    expect(after.filter(feed => before.some(existing => existing.url === feed.url))).toEqual(before)
    expect(after.every(feed => feed.is_enabled && feed.is_discoverable)).toBe(true)
    expect(await countSeededRows(tx, feeds)).toMatchObject({
      topics: 2,
      aliases: 2,
      feeds: 2,
    })
  })

  it('keeps a feed disabled by a later enablement change disabled when reapplied', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    await applySeedSql(tx, stagingSql)
    await appendEnablementChange(tx, feeds[0]!.url, false)

    await applySeedSql(tx, stagingSql)

    const storedFeeds = await readSeededFeeds(tx, feedUrls)
    expect(storedFeeds.map(feed => [feed.url, feed.is_enabled])).toEqual(
      feedUrls.toSorted().map(url => [url, url !== feeds[0]!.url]),
    )
    expect(await countSeededRows(tx, feeds)).toEqual({
      ...expectedCounts,
      enablementChanges: 3,
    })
  })

  it('adds no topic or alias for a URL whose active feed belongs to another topic', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    const occupiedFeed = feeds[0]!
    const { topicSlug } = await insertActiveFeedUnderOtherTopic(tx, occupiedFeed)

    await applySeedSql(tx, stagingSql)

    const storedFeeds = await readSeededFeeds(tx, feedUrls)
    expect(storedFeeds.map(feed => feed.url)).toEqual(feedUrls.toSorted())
    expect(storedFeeds.find(feed => feed.url === feeds[0]!.url)).toMatchObject({
      slug: topicSlug,
      is_enabled: false,
    })
    // Only the other feed is seeded: no orphan topic or alias, and no second feed for the URL.
    expect(await countSeededRows(tx, [occupiedFeed])).toEqual({
      hostnames: 1,
      urls: 1,
      topics: 0,
      aliases: 0,
      feeds: 1,
      enablementChanges: 0,
      discoverabilityChanges: 0,
    })
    expect(storedFeeds.find(feed => feed.url === feeds[1]!.url)).toMatchObject({
      is_enabled: true,
      is_discoverable: true,
    })
  })
})
