import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { topicMergeRelationScratchNames } from '@voucha/types/entities/topic-merge-relation-scratch'

export type TopicMergeRelationCursor = {
  phase: number
  columnPosition: number
  rowId: string | null
  subjectId: string | null
  objectId: string | null
}
export type TopicMergeRelationWorkItem = {
  priority: number
  old_subject_id: string
  old_relation_id: string
  next_subject_id: string | null
  next_relation_id: string | null
}
export const initialTopicMergeRelationCursor: TopicMergeRelationCursor = {
  phase: 0,
  columnPosition: 0,
  rowId: null,
  subjectId: null,
  objectId: null,
}
export function topicMergeRelationWorkTables(table: string) {
  const metadata = entityRelationMetadatum.find(item => item.table_name === table)!
  const { mappings, owners } = topicMergeRelationScratchNames(metadata)
  return { work: mappings, owners }
}
