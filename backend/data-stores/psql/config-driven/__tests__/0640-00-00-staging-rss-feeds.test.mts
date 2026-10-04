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
  clearSeededFeeds,
  countSeededRows,
  readSeededFeeds,
} from '../../../../test-helpers/data-stores/psql/staging-rss-feeds.mts'
import generateStagingRssFeedsSQL, { STAGING_RSS_FEEDS } from '../0640-00-00-staging-rss-feeds.mts'

// The three feeds the staging decision names (vouchington/vouchington#1956).
const SPEC_FEED_URLS = [
  'https://www.theguardian.com/science/rss',
  'https://blog.cloudflare.com/rss/',
  'https://www.quantamagazine.org/feed/',
]
const urls = STAGING_RSS_FEEDS.map(feed => feed.url)

const sortedUrls = urls.toSorted()
const loadSqlTooling = () => Promise.all([loadSqlParserModule(), initSqlAst()])

describe('0640-00-00-staging-rss-feeds environment gate', () => {
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

describe('0640-00-00-staging-rss-feeds feed list', () => {
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
      expect(createSlugFromTitle(`${feed.name} ${urlPart}`, 250)).toBe(feed.slug)
    }
  })

  it('gives every row a distinct UUIDv7 id from before any real change row', () => {
    const ids = STAGING_RSS_FEEDS.flatMap(feed => Object.values(feed.ids))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^01a0f4c2-c400-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-/)
  })
})

describe('0640-00-00-staging-rss-feeds generated SQL guards', () => {
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

describe('0640-00-00-staging-rss-feeds applied to the database', () => {
  const stagingSql = generateStagingRssFeedsSQL('staging')
  const expectedCounts = {
    hostnames: 3,
    urls: 3,
    topics: 3,
    aliases: 3,
    feeds: 3,
    enablementChanges: 3,
    discoverabilityChanges: 3,
  }

  it('creates three enabled, discoverable feeds, each with a topic, hostname and URL', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    await clearSeededFeeds(tx, STAGING_RSS_FEEDS)
    await applySeedSql(tx, stagingSql)

    const feeds = await readSeededFeeds(tx, urls)
    expect(feeds.map(feed => feed.url)).toEqual(sortedUrls)
    for (const feed of feeds) {
      const seeded = STAGING_RSS_FEEDS.find(candidate => candidate.url === feed.url)!
      expect(feed).toMatchObject({
        title: seeded.name,
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
    expect(await countSeededRows(tx, STAGING_RSS_FEEDS)).toEqual(expectedCounts)
  })

  it('changes no row when applied a second time', async () => {
    await using tx = await beginRolledBackSeedTransaction()
    await clearSeededFeeds(tx, STAGING_RSS_FEEDS)
    await applySeedSql(tx, stagingSql)
    const firstFeeds = await readSeededFeeds(tx, urls)
    expect(await countSeededRows(tx, STAGING_RSS_FEEDS)).toEqual(expectedCounts)

    await applySeedSql(tx, stagingSql)

    expect(await countSeededRows(tx, STAGING_RSS_FEEDS)).toEqual(expectedCounts)
    expect(await readSeededFeeds(tx, urls)).toEqual(firstFeeds)
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
    await clearSeededFeeds(tx, STAGING_RSS_FEEDS)
    await applySeedSql(tx, stagingSql)
    const [disabledUrl] = urls
    await appendEnablementChange(tx, disabledUrl!, false)

    await applySeedSql(tx, stagingSql)

    const feeds = await readSeededFeeds(tx, urls)
    expect(feeds.map(feed => [feed.url, feed.is_enabled])).toEqual(
      sortedUrls.map(url => [url, url !== disabledUrl]),
    )
    expect(await countSeededRows(tx, STAGING_RSS_FEEDS)).toEqual({
      ...expectedCounts,
      enablementChanges: 4,
    })
  })
})
