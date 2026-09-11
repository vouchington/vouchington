import { executeHandlerWithCursorInBatches, write } from '@data-stores/psql'
import {
  enqueueBulkUpdateHostnameElectionVoteStatsAndWait,
  enqueueBulkUpdatePostElectionVoteStatsAndWait,
  enqueueBulkUpdateRssFeedItemElectionVoteStatsAndWait,
  enqueueBulkUpdateTopicElectionVoteStatsAndWait,
  enqueueBulkUpdateUserVouchElectionVoteStatsAndWait,
} from '@queues/elections/enqueues'
import {
  enqueueBulkRefreshPostMetricsByIdAndWait,
  enqueueBulkRefreshTopicMetricsByIdAndWait,
  enqueueBulkRefreshUserMetricsByIdAndWait,
} from '@queues/entity-metrics-cache-refresh/enqueues'

const migrationId = 'refresh-legacy-sentiment-entity-caches'
const batchSize = 1_000
type Enqueue = (ids: string[]) => Promise<void>
type Refresh = { voteTable: string; entityIdColumn: string; enqueue: Enqueue }

const refreshes: readonly Refresh[] = [
  {
    voteTable: 'post_votes',
    entityIdColumn: 'post_id',
    enqueue: async ids => {
      await Promise.all([
        enqueueBulkUpdatePostElectionVoteStatsAndWait(ids),
        enqueueBulkRefreshPostMetricsByIdAndWait(ids),
      ])
    },
  },
  {
    voteTable: 'topic_votes',
    entityIdColumn: 'topic_id',
    enqueue: async ids => {
      await Promise.all([
        enqueueBulkUpdateTopicElectionVoteStatsAndWait(ids),
        enqueueBulkRefreshTopicMetricsByIdAndWait(ids),
      ])
    },
  },
  {
    voteTable: 'hostname_votes',
    entityIdColumn: 'hostname_id',
    enqueue: enqueueBulkUpdateHostnameElectionVoteStatsAndWait,
  },
  {
    voteTable: 'rss_feed_item_votes',
    entityIdColumn: 'rss_feed_item_id',
    enqueue: enqueueBulkUpdateRssFeedItemElectionVoteStatsAndWait,
  },
  {
    voteTable: 'user_vouch_votes',
    entityIdColumn: 'target_user_id',
    enqueue: async ids => {
      await Promise.all([
        enqueueBulkUpdateUserVouchElectionVoteStatsAndWait(ids),
        enqueueBulkRefreshUserMetricsByIdAndWait(ids),
      ])
    },
  },
]

export async function enqueueLegacySentimentEntityRefreshes(claimId = migrationId): Promise<void> {
  const { rows: existingClaims } = await write<{ migration_id: string }>(
    `/* getLegacySentimentEntityRefreshClaim */
    SELECT migration_id FROM election_vote_migration_claims
    WHERE migration_id = $1`,
    [claimId],
  )
  if (existingClaims.length > 0) return

  await enqueueRefreshesAt(0)

  async function enqueueRefreshesAt(index: number): Promise<void> {
    const refresh = refreshes[index]
    if (!refresh) return
    await executeHandlerWithCursorInBatches<{ entity_id: string }>(
      `/* streamLegacySentimentEntityRefreshIds */
      SELECT DISTINCT ${refresh.entityIdColumn} AS entity_id
      FROM ${refresh.voteTable}
      WHERE (score = 0 AND NOT score_is_neutral)
         OR (score IN (-1, 1) AND NOT score_is_semantic)
      ORDER BY ${refresh.entityIdColumn}`,
      undefined,
      {
        batchSize,
        readOnly: false,
        handler: async rows => await refresh.enqueue(rows.map(row => row.entity_id)),
      },
    )
    return enqueueRefreshesAt(index + 1)
  }

  await write(
    `/* claimLegacySentimentEntityRefresh */
    INSERT INTO election_vote_migration_claims (migration_id)
    VALUES ($1)
    ON CONFLICT DO NOTHING`,
    [claimId],
  )
}
