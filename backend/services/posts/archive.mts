import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import { terminalizeActiveReviewSuccessionForManualPost } from './review-successions/manual.mts'

type ArchivePostOptions = QueryOptions & { capturePublication?: boolean }

export async function archivePost(
  postId: string,
  archivedById: string,
  options: ArchivePostOptions = {},
): Promise<void> {
  const { capturePublication = true, ...queryOptions } = options
  const run = async (query: TransactionQuery): Promise<void> => {
    if (capturePublication) await lockPostPublication(query, postId)
    await terminalizeActiveReviewSuccessionForManualPost(postId, { query })
    const { rowCount } = await query(
      `/* archivePost */
      UPDATE posts
      SET archived_at = CURRENT_TIMESTAMP,
          archived_by_id = $1
      WHERE id = $2
        AND deleted_at IS NULL
        AND archived_at IS NULL`,
      [archivedById, postId],
    )
    if ((rowCount ?? 0) > 0 && capturePublication) {
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId },
        reason: 'post_archived',
      })
    }
  }
  if (queryOptions.query || queryOptions.client) return withTransactionOptions(queryOptions, run)
  await using transaction = await beginTransaction()
  await run(transaction)
  await transaction.commit()
}

export async function unarchivePost(
  postId: string,
  options: ArchivePostOptions = {},
): Promise<void> {
  const { capturePublication = true, ...queryOptions } = options
  const run = async (query: TransactionQuery): Promise<void> => {
    if (capturePublication) await lockPostPublication(query, postId)
    await terminalizeActiveReviewSuccessionForManualPost(postId, { query })
    const { rowCount } = await query(
      `/* unarchivePost */
      UPDATE posts
      SET archived_at = NULL,
          archived_by_id = NULL
      WHERE id = $1
        AND deleted_at IS NULL
        AND archived_at IS NOT NULL`,
      [postId],
    )
    if ((rowCount ?? 0) > 0 && capturePublication) {
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId },
        reason: 'post_archived',
      })
    }
  }
  if (queryOptions.query || queryOptions.client) return withTransactionOptions(queryOptions, run)
  await using transaction = await beginTransaction()
  await run(transaction)
  await transaction.commit()
}
