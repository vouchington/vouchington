import type { EntityRelationMetadata } from './entity-relations-metadata.mts'

/** A relation group owns bounded parent mappings and vote cursors, not a lease queue. */
export function topicMergeRelationScratchNames(
  metadata: Pick<EntityRelationMetadata, 'subject_type' | 'predicate' | 'object_type'>,
) {
  // The relation predicate remains plural externally; only scratch table names use singular words.
  const suffix = `${metadata.subject_type}_${metadata.predicate}_${metadata.object_type}`.replace(
    'terms_of_service',
    'term_of_service',
  )
  return {
    suffix,
    mappings: `topic_merge_${suffix}_parent_mappings`,
    owners: `topic_merge_${suffix}_vote_owners`,
  }
}
