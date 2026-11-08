import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  lockPostPublication,
  recordPostPublicationChange,
  recordRssFeedDiscoverabilityChanges,
} from '@services/post-publication'
import { listTopicPublicationFeedsPage } from '@services/post-publication/topic-feed-pages'
import type { AggregatedElectionStats, EntityElectionConfig } from './types.mts'
import { buildElectionStatsUpdateQuery } from './vote-stats-update-query.mts'

export type UpdatedElectionStats = {
  prior_votes_score_net: number
}

export async function updateElectionStatsIfChanged(
  config: EntityElectionConfig,
  entityId: string,
  stats: AggregatedElectionStats,
  transactionQuery?: TransactionQuery,
): Promise<UpdatedElectionStats | undefined> {
  if (!config.entityTable) return undefined
  const entityTable = config.entityTable
  // One topic owns at most one active feed, so the staged page never has a continuation.
  const topicFeeds =
    entityTable === 'topics' ? await listTopicPublicationFeedsPage([entityId], null) : null

  const run = async (query: TransactionQuery): Promise<UpdatedElectionStats | undefined> => {
    if (entityTable === 'posts') await lockPostPublication(query, entityId)
    const statement = buildElectionStatsUpdateQuery(config, entityId, stats)

    const { rows } = await query<UpdatedElectionStats>(statement)
    const updated = rows[0]
    const nextVotesScoreNet = stats.votes_score_up - stats.votes_score_down
    if (
      entityTable === 'posts' &&
      updated &&
      updated.prior_votes_score_net > 0 !== nextVotesScoreNet > 0
    )
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId: entityId },
        reason: 'post_updated',
      })
    if (updated && topicFeeds) await recordRssFeedDiscoverabilityChanges(query, topicFeeds.ids)
    return updated
  }
  if (transactionQuery) return withTransactionOptions({ query: transactionQuery }, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
