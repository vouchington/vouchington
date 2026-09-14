import { type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import { lockPostPublication } from '@services/post-publication'
import { recordPostClearancePublicationChange } from './publication-change.mts'
import { runPostClearanceTransaction } from './status-transaction.mts'

export async function approvePendingPostClearance(
  postId: string,
  updatedById?: string | null,
  options?: QueryOptions,
): Promise<boolean> {
  const transactionOptions = options ?? {}
  const run = async (query: TransactionQuery) => {
    await lockPostPublication(query, postId)
    const { rowCount } = await query(
      `/* approvePendingPostClearance */
        WITH pending_post AS (
          SELECT id AS post_id
          FROM posts
          WHERE id = $1
            AND approved_at IS NULL
            AND rejected_at IS NULL
            AND in_review_at IS NULL
          FOR UPDATE
        ),
        inserted_change AS (
          INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id)
          SELECT post_id, 'approve'::post_clearance_change_types, $2
          FROM pending_post
          RETURNING id, post_id, created_at
        )
        UPDATE posts
        SET latest_clearance_change_id = inserted_change.id,
          approved_at = inserted_change.created_at,
          rejected_at = NULL,
          in_review_at = NULL,
          updated_by_id = COALESCE($2, updated_by_id)
        FROM inserted_change
        WHERE posts.id = inserted_change.post_id`,
      [postId, updatedById ?? null],
    )
    const changed = (rowCount ?? 0) > 0
    if (changed) await recordPostClearancePublicationChange(query, postId)
    return changed
  }
  const changed = await runPostClearanceTransaction(transactionOptions, run)
  if (changed && !transactionOptions.query && !transactionOptions.client) {
    void enqueueRefreshTopHashtags()
    await invalidate.posts(postId)
  }
  return changed
}
