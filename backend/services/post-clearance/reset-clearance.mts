import { beginTransaction, withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { invalidate } from '@services/entity-cache/invalidate'
import { recordPostPublicationChange } from '@services/post-publication'

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
    const { rowCount } = await query(
      `/* resetPostClearance:advanceVersion */
    UPDATE posts
    SET clearance_version = clearance_version + 1
    WHERE id = $1
      AND (
        approved_at IS NOT NULL
        OR rejected_at IS NOT NULL
        OR in_review_at IS NOT NULL
        OR clearance_changed_at IS NOT NULL
      )`,
      [postId],
    )
    if (rowCount === 0) return false

    // Append the receipt after the version write settles concurrent changes to this post.
    await query(
      `/* resetPostClearance */
    WITH inserted_change AS (
      INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id)
      VALUES ($1, 'reset_to_pending', $2)
      RETURNING post_id, created_at, changed_by_id
    )
    UPDATE posts
    SET
      clearance_changed_at = inserted_change.created_at,
      clearance_changed_by_id = inserted_change.changed_by_id,
      clearance_public_reason_code = NULL,
      clearance_is_platform_override = FALSE,
      approved_at = NULL,
      rejected_at = NULL,
      in_review_at = NULL
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id`,
      [postId, changedById ?? null],
    )
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId },
      reason: 'post_clearance_changed',
    })
    return true
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
