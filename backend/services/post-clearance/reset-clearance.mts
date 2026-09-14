import { beginTransaction, withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { invalidate } from '@services/entity-cache/invalidate'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

/**
 * Resets a post back to pending when content changes. Provider outcomes are immutable and remain
 * attached to the prior content version.
 */
export async function resetPostClearance(
  postId: string,
  changedById?: string | null,
  options: QueryOptions = {},
): Promise<boolean> {
  const run = async (query: TransactionQuery): Promise<boolean> => {
    await lockPostPublication(query, postId)
    const { rowCount } = await query(
      `/* resetPostClearance */
    WITH reset_post AS (
      SELECT id AS post_id
      FROM posts
      WHERE id = $1
        AND (
          approved_at IS NOT NULL
          OR rejected_at IS NOT NULL
          OR in_review_at IS NOT NULL
          OR latest_clearance_change_id IS NOT NULL
        )
      FOR UPDATE
    ),
    inserted_change AS (
      INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id)
      SELECT post_id, 'reset_to_pending', $2
      FROM reset_post
      RETURNING id, post_id
    )
    UPDATE posts
    SET
      latest_clearance_change_id = inserted_change.id,
      approved_at = NULL,
      rejected_at = NULL,
      in_review_at = NULL
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id`,
      [postId, changedById ?? null],
    )
    const changed = (rowCount ?? 0) > 0
    if (changed) {
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId },
        reason: 'post_clearance_changed',
      })
    }
    return changed
  }
  const changed = await runInTransaction(options, run)
  if (changed && !options.query) await invalidate.posts(postId)
  return changed
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
