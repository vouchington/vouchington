import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  withTransactionOptions,
} from '@data-stores/psql'
import { ELECTION_ENTITY_TABLE_IDENTIFIERS } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  lockPostPublication,
  lockTopicRssFeedPublicationScopes,
  recordPostPublicationChange,
  recordRssFeedDiscoverabilityChanges,
} from '@services/post-publication'
import sql from 'sql-template-strings'
import type { AggregatedElectionStats, EntityElectionConfig } from './types.mts'

export type UpdatedElectionStats = {
  prior_votes_score_net: number
}

export async function updateElectionStatsIfChanged(
  config: EntityElectionConfig,
  entityId: string,
  stats: AggregatedElectionStats,
  transactionQuery?: TransactionQuery,
): Promise<UpdatedElectionStats | undefined> {
  if (!config.entityTable) return
  const entityTable = config.entityTable

  const run = async (query: TransactionQuery): Promise<UpdatedElectionStats | undefined> => {
    if (entityTable === 'posts') await lockPostPublication(query, entityId)
    const topicRssFeedIds =
      entityTable === 'topics' ? await lockTopicRssFeedPublicationScopes(query, [entityId]) : []
    const table = assertWhitelistedSqlIdentifier(
      entityTable,
      ELECTION_ENTITY_TABLE_IDENTIFIERS,
      'entityTable',
    )
    const statement = sql`/* updateElectionStatsIfChanged */
    WITH current AS (
      SELECT id, votes_score_net AS prior_votes_score_net
      FROM `
    statement.append(table)
    statement.append(sql`
      WHERE id = ${entityId}`)

    if (config.deletedAtFilter) {
      statement.append(sql`
        AND deleted_at IS NULL`)
    }

    statement.append(sql`
      FOR UPDATE
    ), updated AS (
      UPDATE `)
    statement.append(table)
    statement.append(sql` AS entity
      SET
        votes_score_up   = ${stats.votes_score_up},
        votes_score_none = ${stats.votes_score_none},
        votes_score_down = ${stats.votes_score_down},
        votes_count_up   = ${stats.votes_count_up},
        votes_count_none = ${stats.votes_count_none},
        votes_count_down          = ${stats.votes_count_down},
        votes_snapshot_xmax       = ${stats.snapshot.xmax}::xid8,
        votes_snapshot_xip_count  = ${stats.snapshot.xipCount}
      FROM current
      WHERE entity.id = current.id
        -- A snapshot with a greater epoch-aware xmax is newer. At equal xmax no new transaction
        -- below that boundary can appear, so the in-progress set can only shrink.
        AND (
          entity.votes_snapshot_xmax IS NULL OR
          entity.votes_snapshot_xmax < ${stats.snapshot.xmax}::xid8 OR
          (
            entity.votes_snapshot_xmax = ${stats.snapshot.xmax}::xid8 AND
            entity.votes_snapshot_xip_count >= ${stats.snapshot.xipCount}
          )
        )
        AND (
          entity.votes_score_up   IS DISTINCT FROM ${stats.votes_score_up} OR
          entity.votes_score_none IS DISTINCT FROM ${stats.votes_score_none} OR
          entity.votes_score_down IS DISTINCT FROM ${stats.votes_score_down} OR
          entity.votes_count_up   IS DISTINCT FROM ${stats.votes_count_up} OR
          entity.votes_count_none IS DISTINCT FROM ${stats.votes_count_none} OR
          entity.votes_count_down          IS DISTINCT FROM ${stats.votes_count_down} OR
          entity.votes_snapshot_xmax       IS DISTINCT FROM ${stats.snapshot.xmax}::xid8 OR
          entity.votes_snapshot_xip_count  IS DISTINCT FROM ${stats.snapshot.xipCount}
        )
      RETURNING current.prior_votes_score_net
    ) SELECT * FROM updated
  `)

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
    if (entityTable === 'topics' && updated)
      await recordRssFeedDiscoverabilityChanges(query, topicRssFeedIds)
    return updated
  }
  if (transactionQuery) return withTransactionOptions({ query: transactionQuery }, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
