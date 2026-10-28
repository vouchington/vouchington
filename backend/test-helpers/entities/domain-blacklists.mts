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
    sql`/* insertTestDomainBlacklist:findSource */
    SELECT id FROM domain_blocklist_sources WHERE name = ${sourceName}
  `,
    options,
  )

  let sourceId: DomainBlacklistSourceId
  if (sourceResult.rows.length > 0) {
    sourceId = sourceResult.rows[0].id
  } else {
    const insertResult = await write(
      sql`/* insertTestDomainBlacklist:createSource */
      INSERT INTO domain_blocklist_sources (type, name, url)
      VALUES ('url'::domain_blocklist_types, ${sourceName}, 'https://example.com/blacklist.txt')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
      options,
    )
    sourceId = insertResult.rows[0].id
  }

  const hostnameId = await upsertTestHostnameId(domain, options)
  await write(
    sql`/* insertTestDomainBlacklist:addDomain */
    INSERT INTO blocklisted_domains (source_id, domain, url_hostname_id)
    VALUES (${sourceId}, ${domain}, ${hostnameId})
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
    sql`/* createTestBlacklistSource */
    INSERT INTO domain_blocklist_sources (type, name, url)
    VALUES (${source.type}::domain_blocklist_types, ${source.name}, ${source.url})
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
  options: QueryOptions = {},
): Promise<number> {
  const result = await read(
    sql`/* countBlacklistEntriesBySource */
    SELECT COUNT(*)::int as count FROM blocklisted_domains
    WHERE source_id = ${sourceId}
  `,
    options,
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
  options: QueryOptions = {},
): Promise<string[]> {
  const result = await read<{ domain: string }>(
    sql`/* listBlacklistDomainsBySource */
    SELECT domain
    FROM blocklisted_domains
    WHERE source_id = ${sourceId}
    ORDER BY domain
  `,
    options,
  )
  return result.rows.map(row => row.domain)
}

/** Plan a reader membership select. Sequential and bitmap scans stay off until this transaction ends. */
export async function explainBlocklistedDomainOrderPlan(
  sourceId: DomainBlacklistSourceId,
  membershipSelectSql: string,
): Promise<string> {
  await using transaction = await beginTransaction()
  await transaction(`/* explainMembership */ SET LOCAL enable_seqscan = off`)
  await transaction(`/* explainMembership */ SET LOCAL enable_bitmapscan = off`)
  const explained = await transaction<{ 'QUERY PLAN': string }>(
    `/* explainMembership */ EXPLAIN ${membershipSelectSql}`,
    [sourceId],
  )
  return explained.rows.map(row => row['QUERY PLAN']).join('\n')
}

export async function getTestBlacklistMembershipDiffAppliedAt(
  sourceId: DomainBlacklistSourceId,
): Promise<Date | null> {
  const result = await read<{ membership_diff_applied_at: Date | null }>(
    sql`/* getTestBlacklistMembershipDiffAppliedAt */
    SELECT membership_diff_applied_at
    FROM domain_blocklist_sources
    WHERE id = ${sourceId}
  `,
  )
  return result.rows[0]?.membership_diff_applied_at ?? null
}
