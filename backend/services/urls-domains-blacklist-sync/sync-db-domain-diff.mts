import type { TransactionQuery } from '@data-stores/psql'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { ADDED_DOMAINS_TABLE, REMOVED_DOMAINS_TABLE } from './sync-cache.mts'

export async function persistDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- existing parent policy must be locked before child creation, then inheritance and feed rows follow in one transaction.
  await lockExistingAffectedHostnames(query)
  await query(
    `/* syncDomainsWithDatabase */
      INSERT INTO url_hostnames (hostname, publicly_introduced_at)
      SELECT domain, CASE WHEN $1::text = 'url' THEN CURRENT_TIMESTAMP ELSE NULL END
      FROM ${ADDED_DOMAINS_TABLE}
      ORDER BY domain
      ON CONFLICT (hostname) DO UPDATE SET
        publicly_introduced_at = COALESCE(url_hostnames.publicly_introduced_at, EXCLUDED.publicly_introduced_at)
      WHERE EXCLUDED.publicly_introduced_at IS NOT NULL
        AND url_hostnames.publicly_introduced_at IS NULL
    `,
    [sourceType],
  )
  await persistInheritedParentBlocks(query)
  await query(
    `/* syncDomainsWithDatabase */
        INSERT INTO blocklisted_domains (source_id, domain, url_hostname_id)
        SELECT $1::bigint AS source_id, added.domain, hostname.id
        FROM ${ADDED_DOMAINS_TABLE} added
        JOIN url_hostnames hostname ON hostname.hostname = added.domain
        ORDER BY added.domain ASC NULLS LAST, source_id ASC NULLS LAST
        ON CONFLICT (domain, source_id) DO NOTHING
      `,
    [sourceId],
  )
  await query(
    `/* syncDomainsWithDatabase */
        DELETE FROM blocklisted_domains d
        USING ${REMOVED_DOMAINS_TABLE} r
        WHERE d.source_id = $1 AND d.domain = r.domain
    `,
    [sourceId],
  )
}

async function lockExistingAffectedHostnames(query: TransactionQuery): Promise<void> {
  // Staff blocks lock these same hostname rows in UUID order. Lock both existing
  // children and their existing ancestors before inserting any missing child;
  // the subsequent inheritance query gets a fresh snapshot after any wait.
  await query(`/* syncDomainsWithDatabase:lockAffectedHostnames */
    WITH RECURSIVE parent_candidates(child_hostname, parent_hostname) AS (
      SELECT domain, domain FROM ${ADDED_DOMAINS_TABLE}
      UNION ALL
      SELECT child_hostname, substring(parent_hostname FROM position('.' IN parent_hostname) + 1)
      FROM parent_candidates
      WHERE position('.' IN parent_hostname) > 0
    ), affected_names AS MATERIALIZED (
      SELECT child_hostname AS hostname FROM parent_candidates
      UNION
      SELECT parent_hostname AS hostname FROM parent_candidates
    ), affected_ids AS MATERIALIZED (
      SELECT DISTINCT hostname.id
      FROM affected_names names
      JOIN url_hostnames hostname ON hostname.hostname = names.hostname
    )
    SELECT hostname.id
    FROM affected_ids affected
    JOIN url_hostnames hostname ON hostname.id = affected.id
    ORDER BY hostname.id FOR KEY SHARE OF hostname
  `)
}

async function persistInheritedParentBlocks(query: TransactionQuery): Promise<void> {
  // Like upsertUrlHostnames, only an independent active parent block is inherited.
  // The added-domain staging table keeps this one statement bounded by this feed's diff.
  await query(`/* syncDomainsWithDatabase:inheritedParentBlocks */
    WITH RECURSIVE parent_candidates(child_hostname, parent_hostname) AS (
      SELECT domain, domain FROM ${ADDED_DOMAINS_TABLE}
      UNION ALL
      SELECT child_hostname, substring(parent_hostname FROM position('.' IN parent_hostname) + 1)
      FROM parent_candidates
      WHERE position('.' IN parent_hostname) > 0
    ), inherited_children AS (
      SELECT DISTINCT child.id
      FROM parent_candidates candidate
      JOIN url_hostnames child ON child.hostname = candidate.child_hostname
      JOIN url_hostnames parent ON parent.hostname = candidate.parent_hostname
      JOIN url_hostname_blocks parent_block ON parent_block.url_hostname_id = parent.id
        AND parent_block.lifted_at IS NULL
        AND parent_block.blocked_source NOT IN ('url_blocklist', 'email_blocklist')
      WHERE NOT EXISTS (
        SELECT 1 FROM url_hostname_blocks child_block
        WHERE child_block.url_hostname_id = child.id
          AND child_block.lifted_at IS NULL
          AND child_block.blocked_source NOT IN ('url_blocklist', 'email_blocklist')
      )
    )
    INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
    SELECT id, 'parent_hostname' FROM inherited_children ORDER BY id
  `)
}
