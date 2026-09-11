/**
 * Domain blacklists entity test helpers
 */

import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  DomainBlacklistSource,
  DomainBlacklistSourceId,
} from '@voucha/types/entities/domain-blacklist-source'

/**
 * Insert test domain blacklist
 */
export async function insertTestDomainBlacklist(
  domain: string,
  sourceName: string = 'ultimate-hosts-blacklist',
  options: QueryOptions = {},
): Promise<void> {
  // Get or create the source
  const sourceResult = await read(
    sql`
    SELECT id FROM domain_blacklist_sources WHERE name = ${sourceName}
  `,
    options,
  )

  let sourceId: DomainBlacklistSourceId
  if (sourceResult.rows.length > 0) {
    sourceId = sourceResult.rows[0].id
  } else {
    const insertResult = await write(
      sql`
      INSERT INTO domain_blacklist_sources (type, name, url)
      VALUES ('url'::domain_blacklist_types, ${sourceName}, 'https://example.com/blacklist.txt')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
      options,
    )
    sourceId = insertResult.rows[0].id
  }

  await write(
    sql`
    INSERT INTO domain_blacklists (source_id, domain)
    VALUES (${sourceId}, ${domain})
    ON CONFLICT (domain, source_id) DO NOTHING
  `,
    options,
  )
}

/**
 * Create a test blacklist source and return its ID
 */
export async function createTestBlacklistSource(
  source: DomainBlacklistSource,
  options: QueryOptions = {},
): Promise<DomainBlacklistSourceId> {
  const result = await write(
    sql`
    INSERT INTO domain_blacklist_sources (type, name, url)
    VALUES (${source.type}::domain_blacklist_types, ${source.name}, ${source.url})
    ON CONFLICT (name) DO UPDATE SET
      type = EXCLUDED.type,
      url = EXCLUDED.url
    RETURNING id
  `,
    options,
  )
  return result.rows[0].id
}

/**
 * Count blacklist entries for a source
 */
export async function countBlacklistEntriesBySource(
  sourceId: DomainBlacklistSourceId,
): Promise<number> {
  const result = await read(sql`
    SELECT COUNT(*)::int as count FROM domain_blacklists
    WHERE source_id = ${sourceId}
  `)
  return result.rows[0].count
}

/**
 * List blacklist entries for a source.
 */
export async function listBlacklistDomainsBySource(
  sourceId: DomainBlacklistSourceId,
): Promise<string[]> {
  const result = await read<{ domain: string }>(sql`
    SELECT domain
    FROM domain_blacklists
    WHERE source_id = ${sourceId}
    ORDER BY domain
  `)
  return result.rows.map(row => row.domain)
}

/**
 * Check if any URL-type domain blacklist entries exist
 */
export async function hasUrlTypeDomainBlacklists(): Promise<boolean> {
  const result = await read(sql`
    SELECT 1 FROM domain_blacklists db
    INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
    WHERE dbs.type = 'url'::domain_blacklist_types
    LIMIT 1
  `)
  return result.rows.length > 0
}

/**
 * Check if any email-type domain blacklist entries exist
 */
export async function hasEmailTypeDomainBlacklists(): Promise<boolean> {
  const result = await read(sql`
    SELECT 1 FROM domain_blacklists db
    INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
    WHERE dbs.type = 'email'::domain_blacklist_types
    LIMIT 1
  `)
  return result.rows.length > 0
}

/**
 * Count total blacklist sources
 */
export async function countBlacklistSources(): Promise<number> {
  const result = await read(sql`
    SELECT COUNT(*)::int as count FROM domain_blacklist_sources
  `)
  return result.rows[0].count
}
