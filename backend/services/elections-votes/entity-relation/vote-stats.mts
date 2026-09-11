import {
  assertWhitelistedSqlIdentifier,
  read,
  beginTransaction,
  write,
  type QueryExecutor,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { invalidate } from '@services/entity-cache'
import { recordPostTopicRelationPublicationChanges } from '@services/entity-relations'
import type { EntityRelationElectionTarget } from '@queues/elections/types'
import {
  aggregateElectionVoteStatsFromPrimary,
  aggregateElectionVoteStatsFromReplica,
} from '../shared/vote-aggregation.mts'
import { ENTITY_RELATION_ELECTION_CONFIG } from './config.mts'
import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { findRssFeedIdsByTopicIds } from '@services/entity-relations/rss-feed-ids-by-topic-ids'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import { entityRelationElectionTables } from './target.mts'
import { lockEntityRelationVoteStatsPostPublicationScopes } from './vote-stats-batch-publication-locks.mts'

const topHashtagRelationTables = new Set([
  'relation__post__category__topic_alias',
  'relation__rss_feed_item__category__topic_alias',
])

type UpdatedEntityRelationVoteStats = {
  subject_id: string
  object_id: string
  prior_votes_score_net: number
}

type EntityRelationVoteStats = {
  votes_score_up: number
  votes_score_none: number
  votes_score_down: number
  votes_count_up: number
  votes_count_none: number
  votes_count_down: number
}

async function updateEntityRelationVoteStatsIfChanged(
  target: EntityRelationElectionTarget,
  stats: EntityRelationVoteStats,
  queryExecutor: QueryExecutor = write,
): Promise<UpdatedEntityRelationVoteStats | undefined> {
  const table = assertWhitelistedSqlIdentifier(
    target.relationTable,
    entityRelationElectionTables,
    'entityRelationTable',
  )
  const query = sql`/* updateEntityRelationVoteStatsIfChanged */
    WITH current AS (
      SELECT id, votes_score_net AS prior_votes_score_net
      FROM `
    .append(table)
    .append(sql`
      WHERE id = ${target.entityRelationId}
      FOR UPDATE
    ), updated AS (
      UPDATE `)
    .append(table).append(sql` AS relation
      SET
        votes_score_up   = ${stats.votes_score_up},
        votes_score_none = ${stats.votes_score_none},
        votes_score_down = ${stats.votes_score_down},
        votes_count_up   = ${stats.votes_count_up},
        votes_count_none = ${stats.votes_count_none},
        votes_count_down = ${stats.votes_count_down}
      FROM current
      WHERE relation.id = current.id
        AND (
          votes_score_up   IS DISTINCT FROM ${stats.votes_score_up} OR
          votes_score_none IS DISTINCT FROM ${stats.votes_score_none} OR
          votes_score_down IS DISTINCT FROM ${stats.votes_score_down} OR
          votes_count_up   IS DISTINCT FROM ${stats.votes_count_up} OR
          votes_count_none IS DISTINCT FROM ${stats.votes_count_none} OR
          votes_count_down IS DISTINCT FROM ${stats.votes_count_down}
        )
      RETURNING subject_id, object_id, current.prior_votes_score_net
    ) SELECT * FROM updated`)
  const { rows } = await queryExecutor<UpdatedEntityRelationVoteStats>(query)
  return rows[0]
}

async function persistEntityRelationVoteStats(
  target: EntityRelationElectionTarget,
  stats: EntityRelationVoteStats,
): Promise<UpdatedEntityRelationVoteStats | undefined> {
  await using query = await beginTransaction()
  await lockEntityRelationVoteStatsPostPublicationScopes(query, target.relationTable, [
    target.entityRelationId,
  ])
  const updated = await updateEntityRelationVoteStatsIfChanged(target, stats, query)
  const nextVotesScoreNet = stats.votes_score_up - stats.votes_score_down
  if (updated && updated.prior_votes_score_net > 0 !== nextVotesScoreNet > 0) {
    await recordPostTopicRelationPublicationChanges(query, target.relationTable, [updated])
  }
  const result = updated

  await query.commit()
  return result
}

async function enqueuePublisherTypeTopicDiscoverabilityIfUpdated(
  target: EntityRelationElectionTarget,
  updated: boolean,
): Promise<void> {
  if (!updated || target.relationTable !== 'relation__topic__publisher_type__topic') return
  const { rows } = await read(sql`/* enqueuePublisherTypeTopicDiscoverabilityIfUpdated */
    SELECT subject_id
    FROM relation__topic__publisher_type__topic
    WHERE id = ${target.entityRelationId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  const topicId = rows[0]?.subject_id as string | undefined
  if (!topicId) return
  const rssFeedIds = await findRssFeedIdsByTopicIds([topicId])
  void enqueueBulkEvaluateRssFeedDiscoverability(rssFeedIds)
}

export function enqueueTopHashtagRefreshIfUpdated(
  target: EntityRelationElectionTarget,
  updated: boolean,
  enqueue: () => unknown = enqueueRefreshTopHashtags,
): void {
  if (updated && topHashtagRelationTables.has(target.relationTable)) void enqueue()
}

export function enqueuePostNotificationReconciliationIfUpdated(
  target: EntityRelationElectionTarget,
  postId: string | undefined,
  enqueue: (postId: string) => unknown = enqueueReconcilePostNotifications,
): void {
  if (
    postId &&
    (target.relationTable === 'relation__post__category__topic' ||
      target.relationTable === 'relation__post__category__topic_alias')
  )
    void enqueue(postId)
}

export async function updateEntityRelationElectionVoteStats(
  target: EntityRelationElectionTarget,
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- replica aggregation, mutation, and follow-up side effects are ordered
  const stats = await aggregateElectionVoteStatsFromReplica(
    ENTITY_RELATION_ELECTION_CONFIG,
    target.entityRelationId,
    target.relationTable,
  )
  const updated = await persistEntityRelationVoteStats(target, stats)
  await invalidate.entity_relation_elections(target.entityRelationId)
  await enqueuePublisherTypeTopicDiscoverabilityIfUpdated(target, Boolean(updated))
  enqueuePostNotificationReconciliationIfUpdated(target, updated?.subject_id)
  enqueueTopHashtagRefreshIfUpdated(target, Boolean(updated))
}

export async function updateEntityRelationElectionVoteStatsFromPrimary(
  target: EntityRelationElectionTarget,
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- read-after-write aggregation, stats persistence, then cache invalidation are ordered
  const stats = await aggregateElectionVoteStatsFromPrimary(
    ENTITY_RELATION_ELECTION_CONFIG,
    target.entityRelationId,
    target.relationTable,
  )
  const updated = await persistEntityRelationVoteStats(target, stats)
  await invalidate.entity_relation_elections(target.entityRelationId)
  await enqueuePublisherTypeTopicDiscoverabilityIfUpdated(target, Boolean(updated))
  enqueuePostNotificationReconciliationIfUpdated(target, updated?.subject_id)
  enqueueTopHashtagRefreshIfUpdated(target, Boolean(updated))
}
