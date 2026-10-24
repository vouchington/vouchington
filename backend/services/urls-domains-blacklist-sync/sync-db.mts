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
import { stageBothDiffFiles, type MembershipDiffPaths } from './membership-diff-stage.mts'
import { applyWithPreparedMembership, lockSourceForDiff } from './membership-version.mts'

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
    await rebuildBloomForSource(sourceType, bloomRebuildDependencies)
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
  const applied = await applyPreparedDomainDiff(transaction, sourceId, sourceType)
  // Advance the generation atomically with membership writes. Source metadata
  // updates already change xmin, so they also invalidate in-flight diffs.
  await transaction(
    `/* syncDomainsWithDatabase:advanceVersion */
     UPDATE domain_blocklist_sources SET updated_at = updated_at WHERE id = $1`,
    [sourceId],
  )
  return applied
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
