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
import { rebuildBloomForSource, defaultBloomRebuildDependencies } from './sync-bloom.mts'
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
import { stageBothDiffFiles, type MembershipDiffPaths } from './membership-diff-stage.mts'
import { applyWithPreparedMembership, lockSourceForDiff } from './membership-version.mts'

type MembershipCacheHeaders = { etag: string | null; lastModifiedAt: Date | null }

type AppliedDomainDiff = { result: SyncBlacklistSourceResult; inlineHostnameIds: string[] }

// Pid keeps an interrupted run's directory distinct from another worker's live diff.
export const BLOCKLIST_DIFF_DIRECTORY_PREFIX = `blocklist-diff-${process.pid}-`

export async function syncDomainsWithDatabase(
  sourceId: DomainBlacklistSourceId,
  response: Response,
  sourceType: 'url' | 'email' = 'url',
  cacheHeaders?: MembershipCacheHeaders,
): Promise<SyncBlacklistSourceResult> {
  await entityCacheWorkConfig.waitForInitialization()
  const directory = mkdtempSync(join(tmpdir(), BLOCKLIST_DIFF_DIRECTORY_PREFIX))
  const desiredPath = join(directory, 'desired')
  const membershipPath = join(directory, 'membership')
  const addedPath = join(directory, 'added')
  const removedPath = join(directory, 'removed')
  try {
    await writeSortedDesiredDomains(response, desiredPath)
    const paths: MembershipDiffPaths = {
      membershipPath,
      desiredPath,
      addedPath,
      removedPath,
    }
    // The first preparation uses the reader. A concurrent writer sync changes
    // the source row's MVCC version; then rebuild from the writer outside the
    // short apply lock so the second sync replaces, rather than unions, feeds.
    const result = await applyWithPreparedMembership(sourceId, paths, version =>
      applyLockedDomainDiff(
        sourceId,
        sourceType,
        client => stageBothDiffFiles(client, addedPath, removedPath),
        version,
      ),
    )
    // The diff is already committed. Validators wait until the rebuild job is accepted,
    // so a missed enqueue cannot leave an etag that makes the next fetch a 304.
    await recordRebuildAndValidators(sourceId, sourceType, cacheHeaders)
    return result
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

async function applyLockedDomainDiff(
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
  stage: (client: PoolClient) => Promise<void>,
  expectedVersion: string | null,
): Promise<SyncBlacklistSourceResult | null> {
  await entityCacheWorkConfig.waitForInitialization()
  const client = await writePool.connect()
  try {
    await using transaction = await beginTransaction({ client })
    const applied = await stageLockedDiff(
      transaction,
      client,
      sourceId,
      sourceType,
      stage,
      expectedVersion,
    )
    if (!applied) return null
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
  expectedVersion: string | null,
): Promise<AppliedDomainDiff | null> {
  await stage(client)
  const version = await lockSourceForDiff(transaction, sourceId, sourceType)
  if (version !== expectedVersion) return null
  return applyPreparedDomainDiff(transaction, sourceId, sourceType)
}

async function recordRebuildAndValidators(
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
  cacheHeaders: MembershipCacheHeaders | undefined,
): Promise<void> {
  await rebuildBloomForSource(sourceType, defaultBloomRebuildDependencies)
  await recordAppliedMembership(sourceId, cacheHeaders)
}

async function recordAppliedMembership(
  sourceId: DomainBlacklistSourceId,
  cacheHeaders: MembershipCacheHeaders | undefined,
): Promise<void> {
  await using transaction = await beginTransaction()
  await writeAppliedMembership(transaction, sourceId, cacheHeaders)
  await transaction.commit()
}

async function writeAppliedMembership(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  cacheHeaders: MembershipCacheHeaders | undefined,
): Promise<void> {
  if (cacheHeaders) {
    await query(
      `/* syncDomainsWithDatabase:recordMembershipDiff */
       UPDATE domain_blocklist_sources
       SET membership_diff_applied_at = CURRENT_TIMESTAMP,
           etag = $2,
           last_modified_at = $3,
           last_fetched_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sourceId, cacheHeaders.etag, cacheHeaders.lastModifiedAt],
    )
    return
  }
  await query(
    `/* syncDomainsWithDatabase:recordMembershipDiff */
     UPDATE domain_blocklist_sources
     SET membership_diff_applied_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [sourceId],
  )
}

async function applyPreparedDomainDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
): Promise<AppliedDomainDiff> {
  // Bump the source row in this transaction so a concurrent diff sees a new xmin.
  // Cache validators stay unchanged until the rebuild job is accepted.
  const { rows: removedRows } = await query<{ count: string }>(
    `/* syncDomainsWithDatabase:bumpSourceVersion */
     WITH bumped AS (
       UPDATE domain_blocklist_sources
       SET last_fetched_at = CURRENT_TIMESTAMP
       WHERE id = $1
     )
     SELECT COUNT(*)::text AS count FROM ${REMOVED_DOMAINS_TABLE}`,
    [sourceId],
  )
  const persisted = await persistDomainDiff(query, sourceId, sourceType)
  const inlineHostnameIds = await enqueueChangedHostnameCaches(query)
  return {
    result: {
      skipped: false,
      domainsAdded: persisted.domainsAdded,
      domainsRemoved: Number(removedRows[0]?.count ?? 0),
    },
    inlineHostnameIds,
  }
}

async function dropSyncTempTables(client: PoolClient): Promise<void> {
  await client.query(`/* syncDomainsWithDatabase */ DROP TABLE IF EXISTS
    ${ADDED_DOMAINS_TABLE}, ${REMOVED_DOMAINS_TABLE}`)
}
