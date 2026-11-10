import { beginTransaction, withTransactionOptions, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export async function markTopicRecommendationApproved(
  currentUser: PrivateUser,
  recommendationId: string,
  topicId: string,
  options: QueryOptions,
): Promise<void> {
  const run = (query: TransactionQuery) =>
    write(
      sql`/* markTopicRecommendationApproved */
      UPDATE post_topic_recommendations
      SET reviewed_at = NOW(),
        reviewed_by_id = ${currentUser.id},
        approval_error_message = NULL,
        rejection_reason = NULL,
        created_topic_id = ${topicId}
      WHERE post_id = ${recommendationId}
        AND reviewed_at IS NULL
    `,
      { query },
    )
  const updateResult =
    options.query || options.client
      ? await withTransactionOptions(options, run)
      : await (async () => {
          await using query = await beginTransaction()
          const result = await run(query)
          await query.commit()
          return result
        })()
  assert(updateResult.rowCount === 1, 422, 'Recommendation is already reviewed')
}
