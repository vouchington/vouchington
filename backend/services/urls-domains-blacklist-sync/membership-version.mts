import { readPool, writePool, type TransactionQuery } from '@data-stores/psql'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { writeCommDiff } from './diff-files.mts'
import type { MembershipDiffPaths } from './membership-diff-stage.mts'
import { copyFreshSourceMembership, copySourceMembership } from './reader-membership-copy.mts'
import type { ReadReplicaSourceVersion } from './replica-freshness.mts'

const MAX_MEMBERSHIP_PREPARATIONS = 3

export type MembershipPrepareHooks = {
  readReplicaSourceVersion?: ReadReplicaSourceVersion
  writeCommDiff?: typeof writeCommDiff
}

/** Rebuild only after another writer changed this source during off-lock preparation. */
export async function applyWithPreparedMembership<T>(
  sourceId: DomainBlacklistSourceId,
  paths: MembershipDiffPaths,
  apply: (version: string | null) => Promise<T | null>,
  hooks: MembershipPrepareHooks,
): Promise<T> {
  async function attempt(index: number): Promise<T> {
    const version = await prepareVersionedMembership(sourceId, paths, index, hooks)
    const result = await apply(version)
    if (result !== null) return result
    if (index + 1 >= MAX_MEMBERSHIP_PREPARATIONS) {
      throw new Error('Domain blacklist source changed during diff preparation')
    }
    return attempt(index + 1)
  }
  return attempt(0)
}

async function prepareVersionedMembership(
  sourceId: DomainBlacklistSourceId,
  paths: MembershipDiffPaths,
  index: number,
  hooks: MembershipPrepareHooks,
): Promise<string | null> {
  const version = await sourceVersion(sourceId)
  // Copy and diff stay outside the source lock. The first attempt uses the replica and
  // refuses a snapshot older than the version just read on the writer. A mismatch retries
  // from the writer.
  if (index === 0) {
    await copyFreshSourceMembership(
      sourceId,
      paths.membershipPath,
      version,
      readPool,
      hooks.readReplicaSourceVersion,
    )
  } else {
    await copySourceMembership(sourceId, paths.membershipPath, writePool)
  }
  await (hooks.writeCommDiff ?? writeCommDiff)(paths)
  return version
}

async function sourceVersion(sourceId: DomainBlacklistSourceId): Promise<string | null> {
  const { rows } = await writePool.query<{ version: string }>(
    `/* syncDomainsWithDatabase:sourceVersion */
     SELECT xmin::text AS version FROM domain_blocklist_sources WHERE id = $1`,
    [sourceId],
  )
  return rows[0]?.version ?? null
}

export async function lockSourceForDiff(
  query: TransactionQuery,
  sourceId: DomainBlacklistSourceId,
  sourceType: 'url' | 'email',
): Promise<string> {
  await query(
    `/* syncDomainsWithDatabase */ SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
    [sourceId],
  )
  // A source reclassified during download must not publicly introduce its email-only domains.
  const { rows } = await query<{ type: 'url' | 'email'; version: string }>(
    `/* syncDomainsWithDatabase:sourceType */ SELECT type, xmin::text AS version FROM domain_blocklist_sources WHERE id = $1 FOR UPDATE`,
    [sourceId],
  )
  if (rows[0]?.type !== sourceType)
    throw new Error('Domain blacklist source type changed during sync')
  return rows[0].version
}
