import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'

type ManualReviewSuccessionOptions = QueryOptions

/**
 * Revokes restoration authority for the active automatic epoch of an already-archived predecessor.
 * Call while the caller still holds its `post:` publication lock and before an unarchive clears the
 * predecessor archive epoch. A post that is merely a successor is intentionally never terminalized.
 */
export async function terminalizeActiveReviewSuccessionForManualPost(
  postId: string,
  options: ManualReviewSuccessionOptions = {},
): Promise<boolean> {
  if (!isUUID(postId)) throw new TypeError('Review succession post ID must be a UUID')
  const { query, client } = options
  const run = async (transaction: TransactionQuery): Promise<boolean> => {
    const { rowCount } = await transaction(
      `/* terminalizeActiveReviewSuccessionForManualPost */
      UPDATE review_successions succession
      SET manual_override_at = CURRENT_TIMESTAMP
      FROM posts predecessor
      WHERE succession.predecessor_post_id = predecessor.id
        AND predecessor.id = $1
        AND succession.predecessor_archived_at = predecessor.archived_at
        AND succession.automatically_restored_at IS NULL
        AND succession.manual_override_at IS NULL`,
      [postId],
    )
    return rowCount === 1
  }
  if (query || client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const terminalized = await run(transaction)
  await transaction.commit()
  return terminalized
}
