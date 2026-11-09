import { beginTransaction, write } from '@data-stores/psql'
import { v7 } from 'uuid'
import {
  repairOAuthFriendEdgePage,
  repairOAuthFriendEdgesInTransaction,
} from '../services/data-retention/cleanup-oauth-friend-repair.mts'

export async function getTestGithubFriendRepairMarker(accountId: string): Promise<Date | null> {
  const { rows } = await write<{ friend_references_resolve_pending_at: Date | null }>(
    `/* getTestGithubFriendRepairMarker */ SELECT friend_references_resolve_pending_at
     FROM github_accounts WHERE id = $1::uuid`,
    [accountId],
  )
  return rows[0]!.friend_references_resolve_pending_at
}

/** Allocate a narrow owned UUIDv7 interval for deterministic keyset pages. */
export function makeTestGithubRepairEdgeIds(): string[] {
  const prefix = v7().slice(0, -4)
  return [0, 1, 2, 3, 4].map(index => `${prefix}${index.toString(16).padStart(4, '0')}`)
}

export async function insertTestGithubRepairEdge(
  id: string,
  accountId: string,
  providerId: string,
  observedAt: string,
): Promise<void> {
  await write(
    `/* insertTestGithubRepairEdge */ INSERT INTO github_friends (id, github_account_id, github_friend_id, last_observed_at)
     VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz)`,
    [id, accountId, providerId, observedAt],
  )
}

/** Process three real pages inside the owned UUID interval without shared cursor state. */
export async function repairTestGithubFriendPages(start: string, end: string) {
  await using query = await beginTransaction()
  const first = await repairOAuthFriendEdgePage(query, 'github', 1, start, end)
  const second = await repairOAuthFriendEdgePage(query, 'github', 1, first.last, end)
  const third = await repairOAuthFriendEdgePage(query, 'github', 1, second.last, end)
  await query.commit()
  return { first, second, third }
}

/** Simulate an invalidation whose ordinary marker-driven cleanup already finished. */
export async function completeTestGithubFriendInvalidations(
  accountIds: readonly string[],
  observedAt: string,
): Promise<void> {
  await write(
    `/* completeTestGithubFriendInvalidations */ UPDATE github_accounts
     SET friend_edges_invalidated_at = $2::timestamptz, friend_edges_cleanup_completed_at = $2::timestamptz
     WHERE id = ANY($1::uuid[])`,
    [accountIds, observedAt],
  )
}

/** Exercise the durable coordinator inside a rollback-only, owned edge interval. */
export async function observeTestGithubFriendRepairCoordinator(
  start: string,
  end: string,
  edgeIds: readonly string[],
) {
  await using query = await beginTransaction()
  await query(
    `/* setTestGithubRepairCursor */ INSERT INTO oauth_friend_reference_repair_cursors
       (provider, cursor_edge_id, cursor_upper_edge_id) VALUES ('github', $1::uuid, $2::uuid)
     ON CONFLICT (provider) DO UPDATE SET cursor_edge_id = EXCLUDED.cursor_edge_id,
       cursor_upper_edge_id = EXCLUDED.cursor_upper_edge_id`,
    [start, end],
  )
  const readCursor = async () => {
    const { rows } = await query<{ cursor_edge_id: string; cursor_upper_edge_id: string }>(
      `/* readTestGithubRepairCursor */ SELECT cursor_edge_id, cursor_upper_edge_id
       FROM oauth_friend_reference_repair_cursors WHERE provider = 'github'`,
    )
    return rows[0] ?? null
  }
  const first = await repairOAuthFriendEdgesInTransaction(query, 'github', 1)
  const firstCursor = await readCursor()
  const second = await repairOAuthFriendEdgesInTransaction(query, 'github', 1)
  const secondCursor = await readCursor()
  const completed = await repairOAuthFriendEdgesInTransaction(query, 'github', 1)
  const completedCursor = await readCursor()
  const { rows: edges } = await query<{ id: string; friend_github_account_id: string | null }>(
    `/* readTestGithubRepairEdges */ SELECT id, friend_github_account_id FROM github_friends
     WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [edgeIds],
  )
  await query.rollback()
  return { first, firstCursor, second, secondCursor, completed, completedCursor, edges }
}
