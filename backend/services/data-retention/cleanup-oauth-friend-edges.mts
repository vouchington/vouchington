import { beginTransaction, read } from '@data-stores/psql'
import type { DataRetentionLimits } from './config.mts'
import { resolveFriendReferencePage } from '@services/oauth-accounts/resolve-friend-reference-page'

const providers = ['facebook', 'github', 'x'] as const
type FriendProvider = (typeof providers)[number]
type Phase = 'erase' | 'resolve'
type Page = { deleted: number; resolved: number; worked: boolean; hasMore: boolean }

/** Account markers are the durable cursor; each transaction touches at most one edge page. */
export async function cleanupOAuthFriendEdgeWork(limits: DataRetentionLimits, now = new Date()) {
  if (!Number.isSafeInteger(limits.batchSize) || limits.batchSize < 1) {
    throw new RangeError('Friend edge cleanup requires a positive batchSize')
  }
  if (!Number.isSafeInteger(limits.maxBatches) || limits.maxBatches < 1) {
    throw new RangeError('Friend edge cleanup requires a positive maxBatches')
  }
  const buckets = providers.flatMap(provider => [
    { provider, phase: 'erase' as const },
    { provider, phase: 'resolve' as const },
  ])
  const start = Math.floor(now.getTime() / 86_400_000) % buckets.length
  let deleted = 0
  let resolved = 0
  let empty = 0
  /* oxlint-disable no-await-in-loop -- each iteration commits one bounded edge page. */
  for (let index = 0; index < limits.maxBatches && empty < buckets.length; index++) {
    const bucket = buckets[(start + index) % buckets.length]!
    // no-mistakes-disable-next-line query-reached-per-item: configured maxBatches caps one indexed edge page per fixed provider/phase bucket
    const page = await cleanupOAuthFriendEdgePage(
      bucket.provider,
      bucket.phase,
      limits.batchSize,
      now,
    )
    deleted += page.deleted
    resolved += page.resolved
    empty = page.worked ? 0 : empty + 1
  }
  /* oxlint-enable no-await-in-loop */
  return { deleted, resolved, hasMore: await hasPendingOAuthFriendEdgeWork(now) }
}

export async function cleanupOAuthFriendEdgePage(
  provider: FriendProvider,
  phase: Phase,
  batchSize: number,
  now = new Date(),
  accountId?: string,
): Promise<Page> {
  if (!providers.includes(provider) || (phase !== 'erase' && phase !== 'resolve')) {
    throw new Error('Invalid friend edge work bucket')
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError('Friend edge page requires a positive batchSize')
  }
  const accountTable = `${provider}_accounts`
  const friendTable = `${provider}_friends`
  const sourceId = `${provider}_account_id`
  const targetId = `friend_${provider}_account_id`
  const accountFilter = accountId ? 'AND id = $2::uuid' : ''
  const accountParameters = accountId ? [now, accountId] : [now]
  await using query = await beginTransaction()
  if (phase === 'erase') {
    const { rows } = await query<{ id: string; cutoff: Date }>(
      `/* lockUnlinkedFriendEdgeAccount */
       /* deadlock-safe: one account lock by invalidation clock and id; child edge pages use SKIP LOCKED. */
       SELECT id, friend_edges_invalidated_at AS cutoff
       FROM ${accountTable}
       WHERE friend_edges_invalidated_at IS NOT NULL
         AND friend_edges_invalidated_at < $1::timestamptz
         AND friend_edges_cleanup_completed_at IS DISTINCT FROM friend_edges_invalidated_at
         ${accountFilter}
       ORDER BY friend_edges_invalidated_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      accountParameters,
    )
    const account = rows[0]
    if (!account) return { deleted: 0, resolved: 0, worked: false, hasMore: false }
    const outgoing = await query(
      `/* eraseUnlinkedOutgoingFriendEdges */ WITH candidates AS (
         SELECT id FROM ${friendTable}
         WHERE ${sourceId} = $1::uuid AND last_observed_at <= $2::timestamptz
         ORDER BY last_observed_at, id LIMIT $3::integer FOR UPDATE SKIP LOCKED
       ) DELETE FROM ${friendTable} target USING candidates WHERE target.id = candidates.id`,
      [account.id, account.cutoff, batchSize],
    )
    const outgoingDeleted = outgoing.rowCount ?? 0
    const incoming =
      outgoingDeleted < batchSize
        ? await query(
            `/* eraseUnlinkedIncomingFriendEdges */ WITH candidates AS (
               SELECT id FROM ${friendTable}
               WHERE ${targetId} = $1::uuid AND last_observed_at <= $2::timestamptz
               ORDER BY last_observed_at, id LIMIT $3::integer FOR UPDATE SKIP LOCKED
             ) DELETE FROM ${friendTable} target USING candidates WHERE target.id = candidates.id`,
            [account.id, account.cutoff, batchSize - outgoingDeleted],
          )
        : null
    const { rows: remaining } = await query<{ more: boolean }>(
      `/* hasUnlinkedFriendEdges */ SELECT
         EXISTS (SELECT 1 FROM ${friendTable} WHERE ${sourceId} = $1::uuid
                 AND last_observed_at <= $2::timestamptz)
         OR EXISTS (SELECT 1 FROM ${friendTable} WHERE ${targetId} = $1::uuid
                    AND last_observed_at <= $2::timestamptz) AS more`,
      [account.id, account.cutoff],
    )
    if (!remaining[0]?.more) {
      await query(
        `/* completeUnlinkedFriendEdgeCleanup */ UPDATE ${accountTable}
         SET friend_edges_cleanup_completed_at = friend_edges_invalidated_at WHERE id = $1::uuid`,
        [account.id],
      )
    }
    await query.commit()
    return {
      deleted: outgoingDeleted + (incoming?.rowCount ?? 0),
      resolved: 0,
      worked: true,
      hasMore: remaining[0]?.more ?? false,
    }
  }

  const { rows } = await query<{ id: string }>(
    `/* lockFriendReferenceResolution */
     /* deadlock-safe: one target account lock by pending clock and id; reference rows use SKIP LOCKED. */
     SELECT id
     FROM ${accountTable}
     WHERE user_id IS NOT NULL AND friend_references_resolve_pending_at < $1::timestamptz
       ${accountFilter}
     ORDER BY friend_references_resolve_pending_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    accountParameters,
  )
  const account = rows[0]
  if (!account) return { deleted: 0, resolved: 0, worked: false, hasMore: false }
  const page = await resolveFriendReferencePage(query, provider, account.id, batchSize)
  if (!page.hasMore) {
    await query(
      `/* completeFriendReferenceResolution */ UPDATE ${accountTable}
       SET friend_references_resolve_pending_at = NULL WHERE id = $1::uuid`,
      [account.id],
    )
  }
  await query.commit()
  return { deleted: 0, resolved: page.resolved, worked: true, hasMore: page.hasMore }
}

async function hasPendingOAuthFriendEdgeWork(now: Date): Promise<boolean> {
  const pendingFor = (provider: FriendProvider) => `
    EXISTS (SELECT 1 FROM ${provider}_accounts
            WHERE friend_edges_invalidated_at < $1::timestamptz
              AND friend_edges_cleanup_completed_at IS DISTINCT FROM friend_edges_invalidated_at)
    OR EXISTS (SELECT 1 FROM ${provider}_accounts
               WHERE user_id IS NOT NULL AND friend_references_resolve_pending_at < $1::timestamptz)`
  const { rows } = await read<{ pending: boolean }>(
    `/* hasPendingOAuthFriendEdgeWork */ SELECT (${providers.map(pendingFor).join(' OR ')}) AS pending`,
    [now],
  )
  return rows[0]?.pending ?? false
}
