import { write, type TransactionQuery } from '@data-stores/psql'
import type { TopicRatingStats } from './types.mts'
import sql from 'sql-template-strings'

/** A completed reconciliation advances the fence even when its aggregate is unchanged. */
export async function advanceTopicRatingRevision(
  query: TransactionQuery,
  topicId: string,
): Promise<void> {
  await write(
    sql`/* advanceTopicRatingRevision */ UPDATE topic_metrics
      SET ratings__revision = ratings__revision + 1 WHERE topic_id = ${topicId}`,
    { client: query.client },
  )
}

export async function upsertTopicRatingStats(
  query: TransactionQuery,
  topicId: string,
  stats: TopicRatingStats,
): Promise<void> {
  await write(
    sql`/* upsertTopicRatingStats */
    INSERT INTO topic_metrics (
      topic_id,
      ratings__score__1,
      ratings__score__2,
      ratings__score__3,
      ratings__score__4,
      ratings__score__5,
      ratings__count__1,
      ratings__count__2,
      ratings__count__3,
      ratings__count__4,
      ratings__count__5,
      ratings__updated_at, ratings__revision
    )
    VALUES (
      ${topicId},
      ${stats.ratings__score__1},
      ${stats.ratings__score__2},
      ${stats.ratings__score__3},
      ${stats.ratings__score__4},
      ${stats.ratings__score__5},
      ${stats.ratings__count__1},
      ${stats.ratings__count__2},
      ${stats.ratings__count__3},
      ${stats.ratings__count__4},
      ${stats.ratings__count__5},
      CURRENT_TIMESTAMP, 1
    )
    ON CONFLICT (topic_id) DO UPDATE SET
      ratings__score__1 = EXCLUDED.ratings__score__1,
      ratings__score__2 = EXCLUDED.ratings__score__2,
      ratings__score__3 = EXCLUDED.ratings__score__3,
      ratings__score__4 = EXCLUDED.ratings__score__4,
      ratings__score__5 = EXCLUDED.ratings__score__5,
      ratings__count__1 = EXCLUDED.ratings__count__1,
      ratings__count__2 = EXCLUDED.ratings__count__2,
      ratings__count__3 = EXCLUDED.ratings__count__3,
      ratings__count__4 = EXCLUDED.ratings__count__4,
      ratings__count__5 = EXCLUDED.ratings__count__5,
      ratings__updated_at = EXCLUDED.ratings__updated_at,
      ratings__revision = topic_metrics.ratings__revision + 1
    RETURNING topic_id
  `,
    { client: query.client },
  )
}
