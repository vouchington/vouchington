import type { TopicMergeMetricStats } from './merge-metrics-stats.mts'

const topicMergeStages = [
  'preflight',
  'aliases',
  'subtype_create',
  'subtypes',
  'derived',
  'classifier_cleanup',
  'references',
  'collisions',
  'bookmarks',
  'relations',
  'subtype_delete',
  'vote_aggregation',
  'finalize',
  'effects',
  'cleanup',
  'cleanup_failed',
] as const
export type TopicMergeStage = (typeof topicMergeStages)[number]
export type TopicMergeOperationRow = {
  id: string
  source_topic_id: string
  destination_topic_id: string
  requested_by_id: string
  fence_token: string
  stage: TopicMergeStage
  stage_table_position: number
  relation_column_position: number
  relation_phase: number
  alias_phase: number
  cursor_row_id: string | null
  cursor_subject_id: string | null
  cursor_object_id: string | null
  cursor_alias: string | null
  cursor_country_position: number | null
  generation: number
  started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  metric_stats: TopicMergeMetricStats
  metric_snapshot_xmax: string | null
  metric_snapshot_xip_count: number | null
  metric_rating_revision: string | null
  source_slug: string
}
export type TopicMergeProgress = Pick<
  TopicMergeOperationRow,
  | 'stage'
  | 'stage_table_position'
  | 'relation_column_position'
  | 'relation_phase'
  | 'alias_phase'
  | 'cursor_row_id'
  | 'cursor_subject_id'
  | 'cursor_object_id'
  | 'cursor_alias'
  | 'cursor_country_position'
  | 'metric_stats'
>
export function nextTopicMergeStage(
  operation: TopicMergeProgress,
  stage: TopicMergeStage,
): TopicMergeProgress {
  return {
    ...operation,
    stage,
    stage_table_position: 0,
    relation_column_position: 0,
    relation_phase: 0,
    alias_phase: 0,
    cursor_row_id: null,
    cursor_subject_id: null,
    cursor_object_id: null,
    cursor_alias: null,
    cursor_country_position: null,
  }
}
