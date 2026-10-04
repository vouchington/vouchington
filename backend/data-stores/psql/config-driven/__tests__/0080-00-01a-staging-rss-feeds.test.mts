import { createSlugFromTitle, normalizeUrlForUrlTable } from '@modules/utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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
  insertActiveFeedUnderOtherTopic,
  readSeededFeeds,
} from '../../../../test-helpers/data-stores/psql/staging-rss-feeds.mts'
import generateStagingRssFeedsSQL, { STAGING_RSS_FEEDS } from '../0080-00-01a-staging-rss-feeds.mts'

// The three feeds the staging decision names (vouchington/vouchington#1956).
const GUARDIAN_URL = 'https://www.theguardian.com/science/rss'
const CLOUDFLARE_URL = 'https://blog.cloudflare.com/rss/'
const QUANTA_URL = 'https://www.quantamagazine.org/feed/'
const SPEC_FEED_URLS = [GUARDIAN_URL, CLOUDFLARE_URL, QUANTA_URL]
const urls = STAGING_RSS_FEEDS.map(feed => feed.url)
// The test database already holds the dev seed's Cloudflare Blog feed and no test may delete or
// update a shared row, so the tests that start from nothing seed only the feeds it lacks. The
// "existing feed" test below covers Cloudflare.
const newFeeds = STAGING_RSS_FEEDS.filter(feed => [GUARDIAN_URL, QUANTA_URL].includes(feed.url))
const newUrls = newFeeds.map(feed => feed.url)

const sortedUrls = urls.toSorted()
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

  it('reads ENVIRONMENT from the process when called without an argument', () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    expect(generateStagingRssFeedsSQL()).toBe('')
    vi.stubEnv('ENVIRONMENT', 'staging')
    expect(generateStagingRssFeedsSQL()).toBe(generateStagingRssFeedsSQL('staging'))
    expect(generateStagingRssFeedsSQL()).not.toBe('')
  })

  it('emits only insert-only statements on staging', () => {
    const statements = splitSqlStatements(stripSqlComments(generateStagingRssFeedsSQL('staging')))
    expect(statements.length).toBeGreaterThan(0)
    for (const statement of statements) expect(statement).toMatch(/^\s*INSERT INTO /i)
    expect(statements.join('\n')).not.toMatch(/DO UPDATE|\bUPDATE\b|\bDELETE\b/i)
  })
})

describe('0080-00-01a-staging-rss-feeds feed list', () => {
  it('seeds exactly the three feeds the staging decision names', () => {
    expect(urls).toEqual(SPEC_FEED_URLS)
  })

  it('stores each feed the way the product normalises and slugs it', () => {
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

  it('gives every row a distinct UUIDv7 id from before any real change row', () => {
    const ids = STAGING_RSS_FEEDS.flatMap(feed => Object.values(feed.ids))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^01a0f4c2-c400-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-/)
  })
})

describe('0080-00-01a-staging-rss-feeds generated SQL guards', () => {
  beforeAll(loadSqlTooling)
  const stagingSql = generateStagingRssFeedsSQL('staging')

  it('passes the generated-DDL guard', () => {
    expect(findFirstGeneratedDdlViolation(stagingSql)).toBeNull()
  })

  it('passes the UUIDv7 created_at guard', () => {
    expect(findFirstUuidv7CreatedAtViolation(stagingSql)).toBeNull()
  })

  it('passes the re-runnable INSERT guard', () => {
    expect(findFirstUnguardedInsertViolation(stagingSql)).toBeNull()
  })
})

describe('0080-00-01a-staging-rss-feeds applied to the database', () => {
  const stagingSql = generateStagingRssFeedsSQL('staging')
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

    const feeds = await readSeededFeeds(tx, newUrls)
    expect(feeds.map(feed => feed.url)).toEqual(newUrls.toSorted())
    for (const feed of feeds) {
      const seeded = newFeeds.find(candidate => candidate.url === feed.url)!
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
    expect(await countSeededRows(tx, newFeeds)).toEqual(expectedCounts)
  })

  it('changes no row when applied a second time', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    await applySeedSql(tx, stagingSql)
    const firstFeeds = await readSeededFeeds(tx, newUrls)
    expect(await countSeededRows(tx, newFeeds)).toEqual(expectedCounts)

    await applySeedSql(tx, stagingSql)

    expect(await countSeededRows(tx, newFeeds)).toEqual(expectedCounts)
    expect(await readSeededFeeds(tx, newUrls)).toEqual(firstFeeds)
  })

  it('leaves a feed that already exists for the same natural keys untouched', async () => {
    // The test database starts with the dev seed's Cloudflare Blog feed (same slug, extra alias).
    await using tx = await beginRolledBackSeedTransaction()
    const before = await readSeededFeeds(tx, urls)

    await applySeedSql(tx, stagingSql)

    const after = await readSeededFeeds(tx, urls)
    expect(after.map(feed => feed.url)).toEqual(sortedUrls)
    expect(after.filter(feed => before.some(existing => existing.url === feed.url))).toEqual(before)
    expect(after.every(feed => feed.is_enabled && feed.is_discoverable)).toBe(true)
    expect(await countSeededRows(tx, STAGING_RSS_FEEDS)).toMatchObject({
      topics: 3,
      aliases: 3,
      feeds: 3,
    })
  })

  it('keeps a feed disabled by a later enablement change disabled when reapplied', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    await applySeedSql(tx, stagingSql)
    await appendEnablementChange(tx, GUARDIAN_URL, false)

    await applySeedSql(tx, stagingSql)

    const feeds = await readSeededFeeds(tx, newUrls)
    expect(feeds.map(feed => [feed.url, feed.is_enabled])).toEqual(
      newUrls.toSorted().map(url => [url, url !== GUARDIAN_URL]),
    )
    expect(await countSeededRows(tx, newFeeds)).toEqual({
      ...expectedCounts,
      enablementChanges: 3,
    })
  })

  it('adds no topic or alias for a URL whose active feed belongs to another topic', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    const guardian = newFeeds.find(feed => feed.url === GUARDIAN_URL)!
    const { topicSlug } = await insertActiveFeedUnderOtherTopic(tx, guardian)

    await applySeedSql(tx, stagingSql)

    const feeds = await readSeededFeeds(tx, newUrls)
    expect(feeds.map(feed => feed.url)).toEqual(newUrls.toSorted())
    expect(feeds.find(feed => feed.url === GUARDIAN_URL)).toMatchObject({
      slug: topicSlug,
      is_enabled: false,
    })
    // Only the other feed is seeded: no orphan topic or alias, and no second feed for the URL.
    expect(await countSeededRows(tx, [guardian])).toEqual({
      hostnames: 1,
      urls: 1,
      topics: 0,
      aliases: 0,
      feeds: 1,
      enablementChanges: 0,
      discoverabilityChanges: 0,
    })
    expect(feeds.find(feed => feed.url === QUANTA_URL)).toMatchObject({
      is_enabled: true,
      is_discoverable: true,
    })
  })
})
