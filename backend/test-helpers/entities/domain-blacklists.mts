import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
/**
 * Domain blacklists entity test helpers
 */

import { beginTransaction, read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { upsertTestHostnameId } from './email-domain-hostname.mts'
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
    allowUnannotatedQuery(sql`
    SELECT id FROM domain_blocklist_sources WHERE name = ${sourceName}
  `),
    options,
  )

  let sourceId: DomainBlacklistSourceId
  if (sourceResult.rows.length > 0) {
    sourceId = sourceResult.rows[0].id
  } else {
    const insertResult = await write(
      allowUnannotatedQuery(sql`
      INSERT INTO domain_blocklist_sources (type, name, url)
      VALUES ('url'::domain_blocklist_types, ${sourceName}, 'https://example.com/blacklist.txt')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `),
      options,
    )
    sourceId = insertResult.rows[0].id
  }

  const hostnameId = await upsertTestHostnameId(domain, options)
  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO blocklisted_domains (source_id, domain, url_hostname_id)
    VALUES (${sourceId}, ${domain}, ${hostnameId})
    ON CONFLICT (domain, source_id) DO NOTHING
  `),
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
    allowUnannotatedQuery(sql`
    INSERT INTO domain_blocklist_sources (type, name, url)
    VALUES (${source.type}::domain_blocklist_types, ${source.name}, ${source.url})
    ON CONFLICT (name) DO UPDATE SET
      type = EXCLUDED.type,
      url = EXCLUDED.url
    RETURNING id
  `),
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
  const result = await read(
    allowUnannotatedQuery(sql`
    SELECT COUNT(*)::int as count FROM blocklisted_domains
    WHERE source_id = ${sourceId}
  `),
  )
  return result.rows[0].count
}

/** Delete only an owned test source and its projected block history. */
export async function deleteTestBlacklistSource(sourceId: DomainBlacklistSourceId): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* deleteTestBlacklistSource */
    DELETE FROM blocklisted_domains WHERE source_id = ${sourceId}
  `)
  await transaction(sql`/* deleteTestBlacklistSource */
    DELETE FROM url_hostname_blocks WHERE domain_blocklist_source_id = ${sourceId}
  `)
  await transaction(sql`/* deleteTestBlacklistSource */
    DELETE FROM domain_blocklist_sources WHERE id = ${sourceId}
  `)
  await transaction.commit()
}

/**
 * List blacklist entries for a source.
 */
export async function listBlacklistDomainsBySource(
  sourceId: DomainBlacklistSourceId,
): Promise<string[]> {
  const result = await read<{ domain: string }>(
    allowUnannotatedQuery(sql`
    SELECT domain
    FROM blocklisted_domains
    WHERE source_id = ${sourceId}
    ORDER BY domain
  `),
  )
  return result.rows.map(row => row.domain)
}

/** Plan for the C-ordered membership read. The planner settings roll back with the transaction. */
export async function explainBlocklistedDomainOrderPlan(
  sourceId: DomainBlacklistSourceId,
): Promise<string> {
  await using transaction = await beginTransaction()
  await transaction(`/* explainMembership */ SET LOCAL enable_seqscan = off`)
  await transaction(`/* explainMembership */ SET LOCAL enable_bitmapscan = off`)
  const explained = await transaction<{ 'QUERY PLAN': string }>(
    `/* explainMembership */ EXPLAIN SELECT domain FROM blocklisted_domains
     WHERE source_id = $1::bigint
     ORDER BY domain COLLATE "C"`,
    [sourceId],
  )
  return explained.rows.map(row => row['QUERY PLAN']).join('\n')
}

/**
 * Check if any URL-type domain blacklist entries exist
 */
export async function hasUrlTypeDomainBlacklists(): Promise<boolean> {
  const result = await read(
    allowUnannotatedQuery(sql`
    SELECT 1 FROM blocklisted_domains db
    INNER JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
    WHERE dbs.type = 'url'::domain_blocklist_types
    LIMIT 1
  `),
  )
  return result.rows.length > 0
}

/**
 * Check if any email-type domain blacklist entries exist
 */
export async function hasEmailTypeDomainBlacklists(): Promise<boolean> {
  const result = await read(
    allowUnannotatedQuery(sql`
    SELECT 1 FROM blocklisted_domains db
    INNER JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
    WHERE dbs.type = 'email'::domain_blocklist_types
    LIMIT 1
  `),
  )
  return result.rows.length > 0
}

/**
 * Count total blacklist sources
 */
export async function countBlacklistSources(): Promise<number> {
  const result = await read(
    allowUnannotatedQuery(sql`
    SELECT COUNT(*)::int as count FROM domain_blocklist_sources
  `),
  )
  return result.rows[0].count
}
