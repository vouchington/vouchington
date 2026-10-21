import { mkdtempSync, rmSync, createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  beginTransaction,
  writePool,
  type PoolClient,
  type TransactionQuery,
} from '@data-stores/psql'
import { from as copyFrom } from 'pg-copy-streams'
import onError from '@modules/on-error'
import {
  rebuildBloomForSource,
  defaultBloomRebuildDependencies,
  type BloomRebuildDependencies,
} from './sync-bloom.mts'
import type { SyncBlacklistSourceResult } from './sync-types.mts'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { persistDomainDiff } from './sync-db-domain-diff.mts'
import {
  ADDED_DOMAINS_TABLE,
  REMOVED_DOMAINS_TABLE,
  enqueueChangedHostnameCaches,
} from './sync-cache.mts'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import { entityCacheWorkConfig } from '@services/entity-cache/work-limits'
import { writeCommDiff, writeSortedDesiredDomains } from './diff-files.mts'
import { copySourceMembership } from './reader-membership-copy.mts'

type AppliedDomainDiff = { result: SyncBlacklistSourceResult; inlineHostnameIds: string[] }

// Pid keeps an interrupted run's directory distinct from another worker's live diff.
export const BLOCKLIST_DIFF_DIRECTORY_PREFIX = `blocklist-diff-${process.pid}-`

export async function syncDomainsWithDatabase(
  sourceId: DomainBlacklistSourceId,
  response: Response,
  sourceType: 'url' | 'email' = 'url',
  bloomRebuildDependencies: BloomRebuildDependencies = defaultBloomRebuildDependencies,
): Promise<SyncBlacklistSourceResult> {
  await entityCacheWorkConfig.waitForInitialization()
  const directory = mkdtempSync(join(tmpdir(), BLOCKLIST_DIFF_DIRECTORY_PREFIX))
  const desiredPath = join(directory, 'desired')
  const membershipPath = join(directory, 'membership')
  const addedPath = join(directory, 'added')
  const removedPath = join(directory, 'removed')
  try {
    await writeSortedDesiredDomains(response, desiredPath)
    // Copy membership only after the source lock, so a concurrent sync of this
    // source cannot diff against a snapshot that predates the previous commit.
    const result = await applyLockedDomainDiff(sourceId, sourceType, async client => {
      await copySourceMembership(sourceId, membershipPath)
      await writeCommDiff({ membershipPath, desiredPath, addedPath, removedPath })
      await stageDiffFile(client, ADDED_DOMAINS_TABLE, addedPath)
      await stageDiffFile(client, REMOVED_DOMAINS_TABLE, removedPath)
    })
    await rebuildBloomForSource(sourceType, bloomRebuildDependencies)
    return result
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/**
 * Stage only the diff. A lagging membership snapshot can omit a domain the writer
 * still has: that removal is absent from the diff and the domain stays blocked
 * until the next run. A repeated addition hits ON CONFLICT DO NOTHING.
 */
export async function applyDomainDiffFiles(
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
  addedPath: string,
  removedPath: string,
): Promise<SyncBlacklistSourceResult> {
  return applyLockedDomainDiff(sourceId, sourceType, async client => {
    await stageDiffFile(client, ADDED_DOMAINS_TABLE, addedPath)
    await stageDiffFile(client, REMOVED_DOMAINS_TABLE, removedPath)
  })
}

async function applyLockedDomainDiff(
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
  stage: (client: PoolClient) => Promise<void>,
): Promise<SyncBlacklistSourceResult> {
  await entityCacheWorkConfig.waitForInitialization()
  const client = await writePool.connect()
  try {
    await using transaction = await beginTransaction({ client })
    await lockSourceForDiff(transaction, sourceId, sourceType)
    await stage(client)
    const applied = await applyPreparedDomainDiff(transaction, sourceId, sourceType)
    await transaction.commit()
    await drainHostnameCacheInvalidationWork({ hostnameIds: applied.inlineHostnameIds }).catch(
      onError,
    )
    return applied.result
  } finally {
    await dropSyncTempTables(client).catch(onError)
    client.release()
  }
}

async function lockSourceForDiff(
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
}

async function stageDiffFile(client: PoolClient, table: string, path: string): Promise<void> {
  await client.query(
    `/* syncDomainsWithDatabase */ CREATE TEMP TABLE ${table} (domain TEXT NOT NULL)`,
  )
  // no-mistakes-disable-next-line postgres-required-predicates: COPY FROM STDIN loads one diff file into a temporary staging table
  const copyStream = client.query(
    copyFrom(`/* syncDomainsWithDatabase */ COPY ${table} (domain) FROM STDIN`),
  )
  await pipeline(createReadStream(path), copyStream)
  await client.query(`/* syncDomainsWithDatabase */ CREATE INDEX ON ${table} (domain)`)
}

async function applyPreparedDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
): Promise<AppliedDomainDiff> {
  const [{ rows: addedRows }, { rows: removedRows }] = await Promise.all([
    query<{ count: string }>(
      `/* syncDomainsWithDatabase */ SELECT COUNT(*)::text AS count FROM ${ADDED_DOMAINS_TABLE}`,
    ),
    query<{ count: string }>(
      `/* syncDomainsWithDatabase */ SELECT COUNT(*)::text AS count FROM ${REMOVED_DOMAINS_TABLE}`,
    ),
  ])
  await persistDomainDiff(query, sourceId, sourceType)
  const inlineHostnameIds = await enqueueChangedHostnameCaches(query)
  return {
    result: {
      skipped: false,
      domainsAdded: Number(addedRows[0]?.count ?? 0),
      domainsRemoved: Number(removedRows[0]?.count ?? 0),
    },
    inlineHostnameIds,
  }
}

async function dropSyncTempTables(client: PoolClient): Promise<void> {
  await client.query(`/* syncDomainsWithDatabase */ DROP TABLE IF EXISTS
    ${ADDED_DOMAINS_TABLE}, ${REMOVED_DOMAINS_TABLE}`)
}
