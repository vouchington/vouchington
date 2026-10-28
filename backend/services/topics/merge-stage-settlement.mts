import type { TransactionQuery } from '@data-stores/psql'
import { processTopicMergeMetricsPage, type TopicMergeMetricPhase } from './merge-metrics.mts'
import { emptyTopicMergeMetricStats } from './merge-metrics-stats.mts'
import { finalizeTopicMergeDomain } from './merge-domain-finalize.mts'
import { processTopicMergeEffectsPage } from './merge-effects.mts'
import { processTopicMergeCleanupPage } from './merge-cleanup-page.mts'
import { nextTopicMergeStage, type TopicMergeOperationRow } from './merge-operation-types.mts'
import type { TopicMergeStagePageResult } from './merge-stage-result.mts'

export async function processTopicMergeSettlementStagePage(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
  limit: number,
): Promise<TopicMergeStagePageResult | null> {
  const { source_topic_id: source, destination_topic_id: destination } = operation
  const position = operation.stage_table_position
  const advance = (stage: TopicMergeOperationRow['stage']) => ({
    progress: nextTopicMergeStage(operation, stage),
  })
  const cursor = {
    rowId: operation.cursor_row_id,
    subjectId: operation.cursor_subject_id,
    objectId: operation.cursor_object_id,
  }

  if (operation.stage === 'vote_aggregation') {
    if (position === 4) {
      // An intervening canonical rating refresh invalidated the prior per-user scratch.
      // Delete only one configured page before rebuilding all four metric phases.
      const { rowCount } = await query(
        `/* resetTopicMergeMetricUsersPage */ WITH page AS MATERIALIZED (
          SELECT user_id FROM topic_merge_metric_users
          WHERE operation_id = $1::uuid ORDER BY user_id LIMIT $2::integer FOR UPDATE
        ) DELETE FROM topic_merge_metric_users scratch USING page
          WHERE scratch.operation_id = $1::uuid AND scratch.user_id = page.user_id`,
        [operation.id, limit],
      )
      return {
        progress: rowCount
          ? operation
          : {
              ...nextTopicMergeStage(operation, 'vote_aggregation'),
              metric_stats: emptyTopicMergeMetricStats(),
            },
      }
    }
    if (position === 0 && operation.metric_snapshot_xmax === null)
      await query(
        `/* captureTopicMergeMetricSnapshot */ WITH captured AS MATERIALIZED (
          SELECT pg_current_snapshot() AS value
        ) UPDATE topic_merge_operations operation SET
          metric_snapshot_xmax = pg_snapshot_xmax(captured.value),
          metric_snapshot_xip_count = (SELECT COUNT(*)::integer FROM pg_snapshot_xip(captured.value)),
          metric_rating_revision = COALESCE((SELECT ratings__revision FROM topic_metrics
            WHERE topic_id = $2::uuid), 0)
        FROM captured WHERE operation.id = $1::uuid
          AND operation.metric_snapshot_xmax IS NULL AND operation.metric_rating_revision IS NULL`,
        [operation.id, destination],
      )
    const page = await processTopicMergeMetricsPage(
      query,
      operation.id,
      destination,
      position as TopicMergeMetricPhase,
      operation.cursor_row_id,
      limit,
      { ...emptyTopicMergeMetricStats(), ...operation.metric_stats },
    )
    if (page.hasMore)
      return {
        progress: { ...operation, cursor_row_id: page.cursor, metric_stats: page.partialStats },
      }
    return position === 3
      ? {
          progress: {
            ...nextTopicMergeStage(operation, 'finalize'),
            metric_stats: page.partialStats,
          },
        }
      : {
          progress: {
            ...nextTopicMergeStage(operation, 'vote_aggregation'),
            stage_table_position: position + 1,
            metric_stats: page.partialStats,
          },
        }
  }
  if (operation.stage === 'finalize') {
    const current = await finalizeTopicMergeDomain(query, operation)
    if (!current) {
      await query(
        `/* resetTopicMergeMetricSnapshot */ UPDATE topic_merge_operations SET
          metric_snapshot_xmax = NULL, metric_snapshot_xip_count = NULL,
          metric_rating_revision = NULL WHERE id = $1::uuid`,
        [operation.id],
      )
      return {
        progress: {
          ...nextTopicMergeStage(operation, 'vote_aggregation'),
          stage_table_position: 4,
          metric_stats: emptyTopicMergeMetricStats(),
        },
      }
    }
    return advance('effects')
  }
  if (operation.stage === 'effects') {
    const page = await processTopicMergeEffectsPage(
      query,
      operation.id,
      source,
      destination,
      operation.requested_by_id,
      position,
      cursor,
      limit,
    )
    return {
      progress: {
        ...operation,
        stage_table_position: page.phase,
        cursor_row_id: page.cursor.rowId,
        cursor_subject_id: page.cursor.subjectId,
        cursor_object_id: page.cursor.objectId,
      },
      ...(page.hasMore ? {} : { progress: nextTopicMergeStage(operation, 'cleanup') }),
    }
  }
  if (operation.stage === 'cleanup' || operation.stage === 'cleanup_failed') {
    const page = await processTopicMergeCleanupPage(query, operation.id, position, limit)
    return {
      progress: { ...operation, stage_table_position: page.position },
      completed: !page.hasMore && operation.stage === 'cleanup',
      failed: !page.hasMore && operation.stage === 'cleanup_failed',
    }
  }
  return null
}
