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
  enqueueUrlBlocklistRebuild,
  invalidateUrlBlocklistReadyMarker,
} from '@services/urls-domains-blacklist/bloom-filter'
import {
  enqueueEmailBlocklistRebuild,
  invalidateEmailBlocklistReadyMarker,
} from '@services/urls-domains-blacklist/email-bloom-filter'
import type { SyncBlacklistSourceResult } from './sync.mts'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
const RAW_DOMAINS_TABLE = 'tmp_domain_blacklist_raw_domains'
const NEW_DOMAINS_TABLE = 'tmp_domain_blacklist_new_domains'
const ADDED_DOMAINS_TABLE = 'tmp_domain_blacklist_added_domains'
const REMOVED_DOMAINS_TABLE = 'tmp_domain_blacklist_removed_domains'

interface BloomRebuildDependencies {
  invalidateEmailReadyMarker: () => Promise<unknown>
  invalidateUrlReadyMarker: () => Promise<unknown>
  enqueueEmailRebuild: () => Promise<void>
  enqueueUrlRebuild: () => Promise<void>
}

const defaultBloomRebuildDependencies: BloomRebuildDependencies = {
  invalidateEmailReadyMarker: invalidateEmailBlocklistReadyMarker,
  invalidateUrlReadyMarker: invalidateUrlBlocklistReadyMarker,
  enqueueEmailRebuild: enqueueEmailBlocklistRebuild,
  enqueueUrlRebuild: enqueueUrlBlocklistRebuild,
}

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
    result = await applyDesiredDomains(transaction, sourceId)
    await transaction.commit()
  } finally {
    await dropSyncTempTables(client).catch(onError)
    client.release()
  }

  if (sourceType === 'email') {
    await bloomRebuildDependencies.invalidateEmailReadyMarker()
    await bloomRebuildDependencies.enqueueEmailRebuild()
  } else {
    await bloomRebuildDependencies.invalidateUrlReadyMarker()
    await bloomRebuildDependencies.enqueueUrlRebuild()
  }
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
): Promise<SyncBlacklistSourceResult> {
  await prepareDomainDiff(query, sourceId)
  return applyPreparedDomainDiff(query, sourceId)
}
async function prepareDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
): Promise<void> {
  await query(
    `/* syncDomainsWithDatabase */ SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
    [sourceId],
  )
  await materializeDomainDiff(query, sourceId)
}
async function materializeDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
): Promise<void> {
  await query(
    `/* syncDomainsWithDatabase */
      CREATE TEMP TABLE ${ADDED_DOMAINS_TABLE} ON COMMIT DROP
      AS
      SELECT n.domain
      FROM ${NEW_DOMAINS_TABLE} n
      LEFT JOIN domain_blacklists d
        ON d.source_id = $1 AND d.domain = n.domain
      WHERE d.domain IS NULL
    `,
    [sourceId],
  )
  await query(
    `/* syncDomainsWithDatabase */
      CREATE TEMP TABLE ${REMOVED_DOMAINS_TABLE} ON COMMIT DROP
      AS
      SELECT d.domain
      FROM domain_blacklists d
      LEFT JOIN ${NEW_DOMAINS_TABLE} n
        ON n.domain = d.domain
      WHERE d.source_id = $1 AND n.domain IS NULL
    `,
    [sourceId],
  )
}
async function applyPreparedDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
): Promise<SyncBlacklistSourceResult> {
  const [{ rows: addedRows }, { rows: removedRows }] = await Promise.all([
    query<{ count: string }>(
      `/* syncDomainsWithDatabase */ SELECT COUNT(*)::text AS count FROM ${ADDED_DOMAINS_TABLE}`,
    ),
    query<{ count: string }>(
      `/* syncDomainsWithDatabase */ SELECT COUNT(*)::text AS count FROM ${REMOVED_DOMAINS_TABLE}`,
    ),
  ])
  await persistDomainDiff(query, sourceId)
  return {
    skipped: false,
    domainsAdded: Number(addedRows[0]?.count ?? 0),
    domainsRemoved: Number(removedRows[0]?.count ?? 0),
  }
}
async function persistDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
): Promise<void> {
  await query(
    `/* syncDomainsWithDatabase */
        INSERT INTO domain_blacklists (source_id, domain)
        SELECT $1::bigint AS source_id, domain
        FROM ${ADDED_DOMAINS_TABLE}
        ORDER BY domain ASC NULLS LAST, source_id ASC NULLS LAST
        ON CONFLICT (domain, source_id) DO NOTHING
      `,
    [sourceId],
  )
  await query(
    `/* syncDomainsWithDatabase */
        DELETE FROM domain_blacklists d
        USING ${REMOVED_DOMAINS_TABLE} r
        WHERE d.source_id = $1 AND d.domain = r.domain
    `,
    [sourceId],
  )
}
async function dropSyncTempTables(client: PoolClient): Promise<void> {
  await client.query(`/* syncDomainsWithDatabase */
    DROP TABLE IF EXISTS
      ${RAW_DOMAINS_TABLE},
      ${NEW_DOMAINS_TABLE},
      ${ADDED_DOMAINS_TABLE},
      ${REMOVED_DOMAINS_TABLE}
  `)
}
