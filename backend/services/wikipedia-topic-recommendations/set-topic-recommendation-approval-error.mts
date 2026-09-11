import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function setTopicRecommendationApprovalError(
  recommendationId: string,
  message: string | null,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* setTopicRecommendationApprovalError */
      UPDATE post_topic_recommendations
      SET approval_error_message = ${message}
      WHERE post_id = ${recommendationId}
        AND reviewed_at IS NULL
    `,
    options,
  )
}
