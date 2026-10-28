import type { TransactionQuery } from '@data-stores/psql'
import { invalidateResolvedEntityRelationElectionKeysStrict } from '@services/entity-cache/invalidate-strict'
import { relationReferences } from './merge-relations.mts'
import { derivedReferences, deleteMergedTopicDerivedPage } from './merge-derived.mts'
import { TOPIC_MERGE_SUBTYPE_TABLES } from './merge-reference-inventory.mts'
import { processTopicMergeClassifierPage } from './merge-classifier-pages.mts'
import {
  createTopicMergeDestinationSubtype,
  deleteTopicMergeSourceSubtype,
} from './merge-reference-page-subtypes.mts'
import { processTopicMergeReferencePage } from './merge-reference-pages.mts'
import {
  topicMergePlainPages,
  topicMergeSubtypePages,
  topicMergeCollisionPages,
  topicMergeBookmarkPages,
} from './merge-reference-page-inventory.mts'
import {
  processTopicMergeRelationPage,
  readTopicMergeRelationEffectTargets,
} from './merge-relation-page.mts'
import { nextTopicMergeStage, type TopicMergeOperationRow } from './merge-operation-types.mts'
import type { TopicMergeStagePageResult } from './merge-stage-result.mts'

export async function processTopicMergeReferenceStagePage(
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

  if (operation.stage === 'subtype_create' || operation.stage === 'subtype_delete') {
    if (position >= TOPIC_MERGE_SUBTYPE_TABLES.length)
      return advance(operation.stage === 'subtype_create' ? 'subtypes' : 'vote_aggregation')
    if (operation.stage === 'subtype_create')
      await createTopicMergeDestinationSubtype(query, position, source, destination)
    else await deleteTopicMergeSourceSubtype(query, position, source)
    return nextTable()
  }
  if (operation.stage === 'derived') {
    if (position >= derivedReferences.length) return advance('classifier_cleanup')
    return (await deleteMergedTopicDerivedPage(query, position, source, limit))
      ? { progress: operation }
      : nextTable()
  }
  if (operation.stage === 'classifier_cleanup') {
    const page = await processTopicMergeClassifierPage(query, source, position, limit)
    return page.hasMore
      ? { progress: { ...operation, stage_table_position: page.phase } }
      : advance('references')
  }

  const references =
    operation.stage === 'subtypes'
      ? topicMergeSubtypePages
      : operation.stage === 'references'
        ? topicMergePlainPages
        : operation.stage === 'collisions'
          ? topicMergeCollisionPages
          : operation.stage === 'bookmarks'
            ? topicMergeBookmarkPages
            : null
  if (references) {
    const reference = references[position]
    if (!reference)
      return advance(
        operation.stage === 'subtypes'
          ? 'derived'
          : operation.stage === 'references'
            ? 'collisions'
            : operation.stage === 'collisions'
              ? 'bookmarks'
              : 'relations',
      )
    return (await processTopicMergeReferencePage(
      query,
      operation.id,
      reference,
      source,
      destination,
      limit,
    ))
      ? { progress: operation }
      : nextTable()
  }
  if (operation.stage === 'relations') {
    if (position >= Object.keys(relationReferences).length) return advance('subtype_delete')
    if (operation.relation_phase === 9)
      await invalidateResolvedEntityRelationElectionKeysStrict(
        await readTopicMergeRelationEffectTargets(query, operation.id, position),
      )
    const page = await processTopicMergeRelationPage(
      query,
      operation.id,
      source,
      destination,
      position,
      {
        phase: operation.relation_phase,
        columnPosition: operation.relation_column_position,
        rowId: operation.cursor_row_id,
        subjectId: operation.cursor_subject_id,
        objectId: operation.cursor_object_id,
      },
      limit,
    )
    return page.hasMore
      ? {
          progress: {
            ...operation,
            relation_phase: page.cursor.phase,
            relation_column_position: page.cursor.columnPosition,
            cursor_row_id: page.cursor.rowId,
            cursor_subject_id: page.cursor.subjectId,
            cursor_object_id: page.cursor.objectId,
          },
        }
      : nextTable()
  }
  return null
}
