import { getPostsWorkLimit } from '@services/posts/work-limits'
import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import {
  listLockedReviewSuccessionCandidates,
  lockReviewSuccessionCandidates,
} from './candidates.mts'
import { listReviewSuccessionGroupPage, lockReviewSuccessionGroups } from './groups.mts'
import { applyReviewSuccessionMutations } from './mutations.mts'
import { planReviewSuccessionMutations } from './plan.mts'
import type { ReviewSuccessionReconciliationResult } from './types.mts'

type ReviewSuccessionReconciliationOptions = QueryOptions

/**
 * Converges one post's bounded exact-topic group page. The lock order is group keys,
 * publication post scopes, then candidate rows; all candidate reads and handoff mutations are
 * bounded set operations inside the same transaction.
 */
export async function reconcileReviewSuccessionsForPostPage(
  postId: string,
  afterId: string | null = null,
  options: ReviewSuccessionReconciliationOptions = {},
): Promise<ReviewSuccessionReconciliationResult> {
  const limit = getPostsWorkLimit('review_succession_candidate_page_size')
  if (!isUUID(postId) || (afterId !== null && !isUUID(afterId)))
    throw new TypeError('Review succession post and cursor IDs must be UUIDs')
  const { query, client } = options
  const run = async (
    transaction: TransactionQuery,
  ): Promise<ReviewSuccessionReconciliationResult> => {
    const { groups, nextCursor } = await listReviewSuccessionGroupPage(
      transaction,
      postId,
      afterId,
      limit,
    )
    if (groups.length === 0) return { changedPostIds: [], nextCursor }
    // ast-grep-ignore: no-three-sequential-awaits -- Group locks must precede publication-scope and candidate-row locks; only the fresh locked candidate reread may drive succession mutations.
    await lockReviewSuccessionGroups(transaction, groups)
    await lockReviewSuccessionCandidates(transaction, groups, limit)
    const candidates = await listLockedReviewSuccessionCandidates(transaction, groups, limit)
    const changedPostIds = await applyReviewSuccessionMutations(
      transaction,
      planReviewSuccessionMutations(candidates),
    )
    return { changedPostIds, nextCursor }
  }
  if (query || client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
