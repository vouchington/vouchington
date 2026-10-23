import { readPool, writePool, type TransactionQuery } from '@data-stores/psql'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'
import { prepareMembershipDiff, type MembershipDiffPaths } from './membership-diff-stage.mts'

const MAX_MEMBERSHIP_PREPARATIONS = 3

/** Rebuild only after another writer changed this source during off-lock preparation. */
export async function applyWithPreparedMembership<T>(
  sourceId: DomainBlacklistSourceId,
  paths: MembershipDiffPaths,
  apply: (version: string | null) => Promise<T | null>,
): Promise<T> {
  async function attempt(index: number): Promise<T> {
    const version = await sourceVersion(sourceId)
    await prepareMembershipDiff(sourceId, paths, index === 0 ? readPool : writePool)
    const result = await apply(version)
    if (result !== null) return result
    if (index + 1 >= MAX_MEMBERSHIP_PREPARATIONS) {
      throw new Error('Domain blacklist source changed during diff preparation')
    }
    return attempt(index + 1)
  }
  return attempt(0)
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
