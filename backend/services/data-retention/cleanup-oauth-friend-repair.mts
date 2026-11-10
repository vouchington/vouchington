import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

export type FriendRepairProvider = 'facebook' | 'github' | 'x'
type Cursor = { cursor_edge_id: string | null; cursor_upper_edge_id: string | null }

/** Scans one UUIDv7 page, erases stale observations and resolves current linked targets. */
export async function repairOAuthFriendEdgePage(
  query: TransactionQuery,
  provider: FriendRepairProvider,
  batchSize: number,
  after: string | null,
  end: string,
): Promise<{ last: string | null; scanned: number; deleted: number; resolved: number }> {
  assertRepairArguments(provider, batchSize)
  const table = `${provider}_friends`
  const accounts = `${provider}_accounts`
  const sourceId = `${provider}_account_id`
  const providerId = `${provider}_friend_id`
  const accountProviderId = `${provider}_user_id`
  const targetId = `friend_${provider}_account_id`
  const { rows } = await query<{ id: string }>(
    `/* scanOAuthFriendEdgeRepairPage */ SELECT id FROM ${table}
     WHERE id <= $1::uuid ${after ? 'AND id > $3::uuid' : ''} ORDER BY id LIMIT $2::integer`,
    after ? [end, batchSize, after] : [end, batchSize],
  )
  if (rows.length === 0) return { last: null, scanned: 0, deleted: 0, resolved: 0 }
  const ids = rows.map(row => row.id)
  const deleted = await query(
    `/* eraseStaleOAuthFriendRepairPage */ WITH candidates AS MATERIALIZED (
       SELECT edge.id FROM ${table} edge
       JOIN LATERAL (
         SELECT friend_edges_invalidated_at FROM ${accounts} WHERE id = edge.${sourceId} LIMIT 1
       ) source ON TRUE
       LEFT JOIN LATERAL (
         SELECT friend_edges_invalidated_at FROM ${accounts}
         WHERE ${accountProviderId} = edge.${providerId} LIMIT 1
       ) target ON TRUE
       WHERE edge.id = ANY($1::uuid[])
         AND ((source.friend_edges_invalidated_at IS NOT NULL AND edge.last_observed_at <= source.friend_edges_invalidated_at)
           OR (target.friend_edges_invalidated_at IS NOT NULL AND edge.last_observed_at <= target.friend_edges_invalidated_at))
       ORDER BY edge.id FOR UPDATE OF edge SKIP LOCKED
     ) DELETE FROM ${table} edge USING candidates WHERE edge.id = candidates.id`,
    [ids],
  )
  const updated = await query(
    `/* resolveOAuthFriendRepairPage */ WITH candidates AS MATERIALIZED (
       SELECT edge.id, target.id AS target_id FROM ${table} edge
       JOIN LATERAL (
         SELECT account.friend_edges_invalidated_at FROM ${accounts} account
         JOIN users owner ON owner.id = account.user_id AND owner.deleted_at IS NULL
         WHERE account.id = edge.${sourceId} LIMIT 1
       ) source ON TRUE
       JOIN LATERAL (
         SELECT account.id, account.friend_edges_invalidated_at FROM ${accounts} account
         JOIN users owner ON owner.id = account.user_id AND owner.deleted_at IS NULL
         WHERE account.${accountProviderId} = edge.${providerId} LIMIT 1
       ) target ON TRUE
       WHERE edge.id = ANY($1::uuid[]) AND edge.${targetId} IS NULL
         AND edge.last_observed_at > COALESCE(source.friend_edges_invalidated_at, '-infinity'::timestamptz)
         AND edge.last_observed_at > COALESCE(target.friend_edges_invalidated_at, '-infinity'::timestamptz)
       ORDER BY edge.id FOR UPDATE OF edge SKIP LOCKED
     ) UPDATE ${table} edge SET ${targetId} = candidates.target_id
     FROM candidates WHERE edge.id = candidates.id AND edge.${targetId} IS NULL`,
    [ids],
  )
  return {
    last: rows.at(-1)!.id,
    scanned: rows.length,
    deleted: deleted.rowCount ?? 0,
    resolved: updated.rowCount ?? 0,
  }
}

/**
 * Commits each cursor page. A sweep exists only while its cursor row does: finishing an account's
 * erase or resolve marker requests one, and completing it deletes the row, so repair runs only
 * while repair markers are pending.
 */
export async function repairOAuthFriendEdges(provider: FriendRepairProvider, batchSize: number) {
  assertRepairArguments(provider, batchSize)
  await using query = await beginTransaction()
  const result = await repairOAuthFriendEdgesInTransaction(query, provider, batchSize)
  await query.commit()
  return result
}

export async function repairOAuthFriendEdgesInTransaction(
  query: TransactionQuery,
  provider: FriendRepairProvider,
  batchSize: number,
) {
  assertRepairArguments(provider, batchSize)
  const { rows } = await query<Cursor>(
    `/* lockOAuthFriendRepairCursor */ SELECT cursor_edge_id, cursor_upper_edge_id
     FROM oauth_friend_reference_repair_cursors WHERE provider = $1 FOR UPDATE`,
    [provider],
  )
  const cursor = rows[0]
  if (!cursor) return { worked: false, deleted: 0, resolved: 0, hasMore: false }
  let end = cursor.cursor_upper_edge_id
  if (!end) {
    const result = await query<{ id: string }>(
      `/* findOAuthFriendRepairSweepEnd */ SELECT id FROM ${provider}_friends ORDER BY id DESC LIMIT 1`,
    )
    end = result.rows[0]?.id ?? null
  }
  if (!end) {
    await query(
      '/* clearOAuthFriendRepairCursor */ DELETE FROM oauth_friend_reference_repair_cursors WHERE provider = $1',
      [provider],
    )
    return { worked: false, deleted: 0, resolved: 0, hasMore: false }
  }
  const page = await repairOAuthFriendEdgePage(
    query,
    provider,
    batchSize,
    cursor.cursor_edge_id,
    end,
  )
  const hasMore = page.scanned === batchSize
  if (!hasMore) {
    await query(
      '/* clearOAuthFriendRepairCursor */ DELETE FROM oauth_friend_reference_repair_cursors WHERE provider = $1',
      [provider],
    )
  } else {
    await query(
      `/* advanceOAuthFriendRepairCursor */ UPDATE oauth_friend_reference_repair_cursors
       SET cursor_edge_id = $2::uuid, cursor_upper_edge_id = $3::uuid WHERE provider = $1`,
      [provider, page.last, end],
    )
  }
  return { worked: page.scanned > 0, deleted: page.deleted, resolved: page.resolved, hasMore }
}

function assertRepairArguments(provider: FriendRepairProvider, batchSize: number): void {
  if (!['facebook', 'github', 'x'].includes(provider)) throw new Error('Invalid friend provider')
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new RangeError('Invalid friend repair batch size')
}
