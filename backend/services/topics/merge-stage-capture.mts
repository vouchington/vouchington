import type { TransactionQuery } from '@data-stores/psql'
import { processTopicMergeAliasPage, type TopicMergeAliasPhase } from './merge-aliases-page.mts'
import { processTopicMergeParentPreflightPage } from './merge-parent-pages.mts'
import {
  processTopicMergeCompatibilityPage,
  topicMergeCompatibilityProbeCount,
} from './merge-preflight-pages.mts'
import { processTopicMergeRelationPreflightPage } from './merge-relation-page.mts'
import { relationReferences } from './merge-relations.mts'
import {
  processTopicMergePriorityPreflightPage,
  topicMergePriorityProbeCount,
} from './merge-priority-preflight.mts'
import { nextTopicMergeStage, type TopicMergeOperationRow } from './merge-operation-types.mts'
import type { TopicMergeStagePageResult } from './merge-stage-result.mts'

export async function processTopicMergeCaptureStagePage(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
  limit: number,
): Promise<TopicMergeStagePageResult | null> {
  const { source_topic_id: source, destination_topic_id: destination } = operation
  const position = operation.stage_table_position
  const advance = (stage: TopicMergeOperationRow['stage']) => ({
    progress: nextTopicMergeStage(operation, stage),
  })
  const nextTable = () => ({
    progress: {
      ...nextTopicMergeStage(operation, operation.stage),
      stage_table_position: position + 1,
    },
  })
  const relationCursor = {
    phase: operation.relation_phase,
    columnPosition: operation.relation_column_position,
    rowId: operation.cursor_row_id,
    subjectId: operation.cursor_subject_id,
    objectId: operation.cursor_object_id,
  }

  if (operation.stage === 'preflight') {
    if (position < topicMergeCompatibilityProbeCount) {
      const page = await processTopicMergeCompatibilityPage(
        query,
        source,
        destination,
        position,
        position === 3
          ? (operation.cursor_country_position?.toString() ?? null)
          : operation.cursor_row_id,
        limit,
      )
      return page.errorCode
        ? { progress: operation, errorCode: page.errorCode }
        : page.hasMore
          ? {
              progress: {
                ...operation,
                cursor_row_id: position === 3 ? null : page.cursor,
                cursor_country_position: position === 3 ? Number(page.cursor) : null,
              },
            }
          : nextTable()
    }
    if (position === topicMergeCompatibilityProbeCount) {
      const page = await processTopicMergeParentPreflightPage(
        query,
        operation.id,
        source,
        destination,
        limit,
      )
      return page.errorCode
        ? { progress: operation, errorCode: page.errorCode }
        : page.hasMore
          ? { progress: operation }
          : nextTable()
    }
    const table = position - topicMergeCompatibilityProbeCount - 1
    if (table < Object.keys(relationReferences).length) {
      const page = await processTopicMergeRelationPreflightPage(
        query,
        source,
        destination,
        table,
        relationCursor,
        limit,
      )
      return page.errorCode
        ? { progress: operation, errorCode: 'topic_merge_reference_conflict' }
        : page.hasMore
          ? {
              progress: {
                ...operation,
                relation_column_position: page.cursor.columnPosition,
                cursor_subject_id: page.cursor.subjectId,
                cursor_object_id: page.cursor.objectId,
              },
            }
          : nextTable()
    }
    const priorityPosition = table - Object.keys(relationReferences).length
    if (priorityPosition >= topicMergePriorityProbeCount) return advance('aliases')
    const page = await processTopicMergePriorityPreflightPage(
      query,
      operation.id,
      [source, destination],
      priorityPosition,
      operation.cursor_subject_id,
      operation.cursor_object_id,
      limit,
    )
    return page.conflict
      ? { progress: operation, errorCode: 'topic_merge_reservation_conflict' }
      : page.hasMore
        ? {
            progress: {
              ...operation,
              cursor_subject_id: page.cursorPageKey,
              cursor_object_id: page.cursorRowKey,
            },
          }
        : nextTable()
  }
  if (operation.stage === 'aliases') {
    const page = await processTopicMergeAliasPage(
      query,
      operation.id,
      source,
      destination,
      operation.requested_by_id,
      operation.source_slug,
      operation.alias_phase as TopicMergeAliasPhase,
      operation.cursor_alias,
      limit,
    )
    if (page.hasMore) return { progress: { ...operation, cursor_alias: page.cursorAlias } }
    return operation.alias_phase === 4
      ? advance('subtype_create')
      : { progress: { ...operation, alias_phase: operation.alias_phase + 1, cursor_alias: null } }
  }
  return null
}
