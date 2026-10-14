import {
  beginTransaction,
  writePool,
  type PoolClient,
  type TransactionQuery,
} from '@data-stores/psql'
import { from as copyFrom } from 'pg-copy-streams'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import onError from '@modules/on-error'
import { readNormalizedDomains } from './sync-utils.mts'
import {
  rebuildBloomForSource,
  defaultBloomRebuildDependencies,
  type BloomRebuildDependencies,
} from './sync-bloom.mts'
import type { SyncBlacklistSourceResult } from './sync-types.mts'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import {
  ADDED_DOMAINS_TABLE,
  REMOVED_DOMAINS_TABLE,
  invalidateChangedHostnameCaches,
} from './sync-cache.mts'
const RAW_DOMAINS_TABLE = 'tmp_domain_blacklist_raw_domains'
const NEW_DOMAINS_TABLE = 'tmp_domain_blacklist_new_domains'
async function* generateDomainCsvRows(response: Response): AsyncGenerator<string> {
  for await (const domain of readNormalizedDomains(response)) {
    yield `"${domain.replaceAll('"', '""')}"\n`
  }
}
export async function syncDomainsWithDatabase(
  sourceId: DomainBlacklistSourceId,
  response: Response,
  sourceType: 'url' | 'email' = 'url',
  bloomRebuildDependencies: BloomRebuildDependencies = defaultBloomRebuildDependencies,
): Promise<SyncBlacklistSourceResult> {
  const client = await writePool.connect()
  let result: SyncBlacklistSourceResult
  try {
    await stageDesiredDomains(client, response)
    await using transaction = await beginTransaction({ client })
    result = await applyDesiredDomains(transaction, sourceId, sourceType)
    await transaction.commit()
    await invalidateChangedHostnameCaches(client).catch(onError)
  } finally {
    await dropSyncTempTables(client).catch(onError)
    client.release()
  }
  await rebuildBloomForSource(sourceType, bloomRebuildDependencies)
  return result
}
async function stageDesiredDomains(client: PoolClient, response: Response): Promise<void> {
  await copyRawDomains(client, response)
  await materializeDesiredDomains(client)
}
async function copyRawDomains(client: PoolClient, response: Response): Promise<void> {
  await client.query(
    `/* syncDomainsWithDatabase */ CREATE TEMP TABLE ${RAW_DOMAINS_TABLE} (domain TEXT NOT NULL)`,
  )
  const copyStream = client.query(
    copyFrom(
      `/* syncDomainsWithDatabase */ COPY ${RAW_DOMAINS_TABLE} (domain) FROM STDIN WITH (FORMAT CSV)`,
    ),
  )
  await pipeline(Readable.from(generateDomainCsvRows(response)), copyStream)
}
async function materializeDesiredDomains(client: PoolClient): Promise<void> {
  await client.query(`/* syncDomainsWithDatabase */
      CREATE TEMP TABLE ${NEW_DOMAINS_TABLE}
      AS
      SELECT DISTINCT domain
      FROM ${RAW_DOMAINS_TABLE}
    `)
  await client.query(`/* syncDomainsWithDatabase */ CREATE INDEX ON ${NEW_DOMAINS_TABLE} (domain)`)
}
async function applyDesiredDomains(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
): Promise<SyncBlacklistSourceResult> {
  await prepareDomainDiff(query, sourceId, sourceType)
  return applyPreparedDomainDiff(query, sourceId, sourceType)
}
async function prepareDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
): Promise<void> {
  await query(
    `/* syncDomainsWithDatabase */ SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
    [sourceId],
  )
  // A source reclassified during download must not publicly introduce its email-only domains.
  const { rows } = await query<{ type: 'url' | 'email' }>(
    `/* syncDomainsWithDatabase:sourceType */ SELECT type FROM domain_blocklist_sources WHERE id = $1 FOR UPDATE`,
    [sourceId],
  )
  if (rows[0]?.type !== sourceType)
    throw new Error('Domain blacklist source type changed during sync')
  await materializeDomainDiff(query, sourceId)
}
async function materializeDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
): Promise<void> {
  await Promise.all([
    query(
      `/* syncDomainsWithDatabase */
      CREATE TEMP TABLE ${ADDED_DOMAINS_TABLE}
      AS
      SELECT n.domain
      FROM ${NEW_DOMAINS_TABLE} n
      LEFT JOIN blocklisted_domains d
        ON d.source_id = $1 AND d.domain = n.domain
      WHERE d.domain IS NULL
    `,
      [sourceId],
    ),
    query(
      `/* syncDomainsWithDatabase */
      CREATE TEMP TABLE ${REMOVED_DOMAINS_TABLE}
      AS
      SELECT d.domain
      FROM blocklisted_domains d
      LEFT JOIN ${NEW_DOMAINS_TABLE} n
        ON n.domain = d.domain
      WHERE d.source_id = $1 AND n.domain IS NULL
    `,
      [sourceId],
    ),
  ])
  await Promise.all([
    query(`/* syncDomainsWithDatabase */ CREATE INDEX ON ${ADDED_DOMAINS_TABLE} (domain)`),
    query(`/* syncDomainsWithDatabase */ CREATE INDEX ON ${REMOVED_DOMAINS_TABLE} (domain)`),
  ])
}
async function applyPreparedDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
): Promise<SyncBlacklistSourceResult> {
  const [{ rows: addedRows }, { rows: removedRows }] = await Promise.all([
    query<{ count: string }>(
      `/* syncDomainsWithDatabase */ SELECT COUNT(*)::text AS count FROM ${ADDED_DOMAINS_TABLE}`,
    ),
    query<{ count: string }>(
      `/* syncDomainsWithDatabase */ SELECT COUNT(*)::text AS count FROM ${REMOVED_DOMAINS_TABLE}`,
    ),
  ])
  await persistDomainDiff(query, sourceId, sourceType)
  return {
    skipped: false,
    domainsAdded: Number(addedRows[0]?.count ?? 0),
    domainsRemoved: Number(removedRows[0]?.count ?? 0),
  }
}
async function persistDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- hostname FK owners must exist before block rows; ordered insert/delete projects policy in one transaction.
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
async function dropSyncTempTables(client: PoolClient): Promise<void> {
  await client.query(`/* syncDomainsWithDatabase */ DROP TABLE IF EXISTS
    ${RAW_DOMAINS_TABLE}, ${NEW_DOMAINS_TABLE},
    ${ADDED_DOMAINS_TABLE}, ${REMOVED_DOMAINS_TABLE}`)
}
