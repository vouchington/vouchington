import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { recordModeratorAction } from '@services/moderator-actions'

// lockPost and unlockPost are intentionally idempotent (no-op when already
// in the target state) and silently succeed when the post does not exist.
// The route layer 404s before calling here; direct callers must guard if
// they need "not found" semantics.

async function lockPostForLock(postId: string, query: TransactionQuery): Promise<void> {
  await query(sql`/* lockPostForLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${postId}, 0))
  `)
}

export async function lockPost(
  postId: string,
  lockedById: string,
  options?: QueryOptions,
): Promise<void> {
  type LockResult = { community_id: string | null; created_by_id: string | null } | null
  const run = async (query: TransactionQuery): Promise<LockResult> => {
    await lockPostForLock(postId, query)

    // Re-check under the advisory lock to prevent concurrent duplicate inserts.
    const { rows: existing } = await query(sql`/* lockPost:checkActive */
      SELECT 1 FROM post_locks
      WHERE post_id = ${postId}
        AND lifted_at IS NULL
      LIMIT 1
    `)
    if (existing.length > 0) return null

    const { rows } = await query<{ community_id: string | null; created_by_id: string | null }>(
      sql`/* lockPost:insert */
      INSERT INTO post_locks (post_id, locked_by_id)
      SELECT p.id, ${lockedById}
      FROM posts p
      WHERE p.id = ${postId}
        AND p.deleted_at IS NULL
      RETURNING
        (SELECT community_id FROM posts WHERE id = post_id) AS community_id,
        (SELECT created_by_id FROM posts WHERE id = post_id) AS created_by_id
      `,
    )
    return rows[0] ?? null
  }
  const result = await runInTransaction(options ?? {}, run)

  if (!result) return
  const isModerationLock = lockedById !== result.created_by_id
  if (isModerationLock) {
    await recordModeratorAction(
      lockedById,
      { actionType: 'lock', postId, communityId: result.community_id ?? null },
      options,
    )
  }
}

export async function unlockPost(
  postId: string,
  unlockedById: string | null,
  options?: QueryOptions,
): Promise<void> {
  type UnlockRow = { community_id: string | null; created_by_id: string | null }
  const run = async (query: TransactionQuery): Promise<UnlockRow[]> => {
    await lockPostForLock(postId, query)
    const { rows, rowCount } = await query<UnlockRow>(sql`/* unlockPost */
      UPDATE post_locks pl
      SET lifted_at = CURRENT_TIMESTAMP,
          lifted_by_id = ${unlockedById}
      FROM posts p
      WHERE pl.post_id = ${postId}
        AND pl.lifted_at IS NULL
        AND p.id = pl.post_id
        AND p.deleted_at IS NULL
      RETURNING p.community_id, p.created_by_id
    `)
    return (rowCount ?? 0) > 0 ? rows : []
  }
  const unlockedRows = await runInTransaction(options ?? {}, run)

  if (unlockedRows.length > 0) {
    const communityId = unlockedRows[0]?.community_id ?? null
    const isModerationUnlock = !unlockedById || unlockedById !== unlockedRows[0]?.created_by_id
    if (isModerationUnlock) {
      await recordModeratorAction(
        unlockedById,
        { actionType: 'unlock', postId, communityId },
        options,
      )
    }
  }
}

async function runInTransaction<Result>(
  options: QueryOptions,
  run: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
