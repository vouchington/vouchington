import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { topicMergeRelationScratchNames } from '@voucha/types/entities/topic-merge-relation-scratch'

const topicMergeRelationScratch = entityRelationMetadatum.flatMap(metadata => {
  if (!metadata.election || (metadata.subject_type !== 'topic' && metadata.object_type !== 'topic'))
    return []
  const { mappings, owners } = topicMergeRelationScratchNames(metadata)
  return [
    [
      mappings,
      'At most four active relation parents per merge operation; finalizing each relation group deletes its work rows.',
    ],
    [
      owners,
      'Temporary vote ownership rows cascade when the owning relation group work rows are deleted.',
    ],
  ] as const
})

export const TOPIC_MERGE_BOUNDED_TABLES = new Map<string, string>([
  ...topicMergeRelationScratch,
  ...(
    [
      'topic_merge_parent_ancestors',
      'topic_merge_metric_users',
      'topic_merge_operation_aliases',
    ] as const
  ).map(
    table =>
      [
        table,
        'Rows belong to an active topic merge operation and are deleted in bounded cleanup pages before that operation settles.',
      ] as const,
  ),
])
