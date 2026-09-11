import { executeHandlerWithCursorInBatches, write } from '@data-stores/psql'
import { enqueueBulkUpdateTopicElectionVoteStatsAndWait } from '@queues/elections/enqueues'
import { enqueueBulkRefreshTopicMetricsByIdAndWait } from '@queues/entity-metrics-cache-refresh/enqueues'

const migrationId = 'refresh-legacy-sentiment-topic-rating-metrics'
const batchSize = 1_000
type TopicMetricEnqueue = (topicIds: string[]) => Promise<void>
type TopicElectionEnqueue = (topicIds: string[]) => Promise<void>

export async function enqueueLegacySentimentTopicMetricRefreshes(
  claimId = migrationId,
  enqueue: TopicMetricEnqueue = enqueueBulkRefreshTopicMetricsByIdAndWait,
  enqueueElectionStats: TopicElectionEnqueue = enqueueBulkUpdateTopicElectionVoteStatsAndWait,
): Promise<void> {
  const { rows: existingClaims } = await write<{ migration_id: string }>(
    `/* getLegacySentimentTopicMetricRefreshClaim */
    SELECT migration_id FROM election_vote_migration_claims
    WHERE migration_id = $1`,
    [claimId],
  )
  if (existingClaims.length > 0) return

  await executeHandlerWithCursorInBatches<{ topic_id: string }>(
    `/* streamLegacySentimentTopicMetricRefreshIds */
      SELECT DISTINCT topic_id
      FROM topic_votes
      WHERE (score = 0 AND NOT score_is_neutral)
         OR (score IN (-1, 1) AND NOT score_is_semantic)
      ORDER BY topic_id
    `,
    undefined,
    {
      batchSize,
      readOnly: false,
      handler: async rows => {
        const topicIds = rows.map(row => row.topic_id)
        await Promise.all([enqueue(topicIds), enqueueElectionStats(topicIds)])
      },
    },
  )

  await write(
    `/* claimLegacySentimentTopicMetricRefresh */
    INSERT INTO election_vote_migration_claims (migration_id)
    VALUES ($1)
    ON CONFLICT DO NOTHING`,
    [claimId],
  )
}
