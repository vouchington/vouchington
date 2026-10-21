import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  beginTransaction,
  writePool,
  type PoolClient,
  type TransactionQuery,
} from '@data-stores/psql'
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
import { writeSortedDesiredDomains } from './diff-files.mts'
import {
  stageBothDiffFiles,
  stageMembershipDiff,
  type MembershipDiffPaths,
} from './membership-diff-stage.mts'

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
    return await diffLockedMembership(sourceId, sourceType, bloomRebuildDependencies, {
      membershipPath,
      desiredPath,
      addedPath,
      removedPath,
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/**
 * Stage only the diff. A lagging membership snapshot can omit a domain the writer
 * still has: that removal is absent from the diff and the domain stays blocked
 * until the next run. A repeated addition hits ON CONFLICT DO NOTHING.
 * @internal Stale-membership tests apply a prepared diff without the reader copy.
 */
export async function applyDomainDiffFiles(
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
  addedPath: string,
  removedPath: string,
): Promise<SyncBlacklistSourceResult> {
  return applyLockedDomainDiff(sourceId, sourceType, client =>
    stageBothDiffFiles(client, addedPath, removedPath),
  )
}

async function diffLockedMembership(
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
  bloomRebuildDependencies: BloomRebuildDependencies,
  paths: MembershipDiffPaths,
): Promise<SyncBlacklistSourceResult> {
  const result = await applyLockedDomainDiff(sourceId, sourceType, client =>
    stageMembershipDiff(client, sourceId, paths),
  )
  await rebuildBloomForSource(sourceType, bloomRebuildDependencies)
  return result
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
    const applied = await stageLockedDiff(transaction, client, sourceId, sourceType, stage)
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

async function stageLockedDiff(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  client: PoolClient,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
  stage: (client: PoolClient) => Promise<void>,
): Promise<AppliedDomainDiff> {
  await lockSourceForDiff(transaction, sourceId, sourceType)
  await stage(client)
  return applyPreparedDomainDiff(transaction, sourceId, sourceType)
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
