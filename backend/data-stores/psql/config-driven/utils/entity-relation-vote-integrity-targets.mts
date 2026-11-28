import { getElectionIndexName } from './election-sql-identifiers.mts'
import {
  getEntityRelationIntegritySubjectColumn,
  getEntityRelationIntegrityTargetColumn,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'
import { buildConstraintAddAndValidateSql } from '@vouchington/postgres/catalog-guarded-ddl'

export function isTopicMergeElectionRelation(
  metadata: Pick<EntityRelationMetadata, 'election' | 'subject_type' | 'object_type'>,
): boolean {
  return (
    metadata.election && (metadata.subject_type === 'topic' || metadata.object_type === 'topic')
  )
}

export function createEntityRelationVoteIntegrityTargets(
  electionRelations: EntityRelationMetadata[],
): string {
  const statements = electionRelations.flatMap(metadata => {
    const targetColumn = getEntityRelationIntegrityTargetColumn(metadata)
    const subjectColumn = getEntityRelationIntegritySubjectColumn(metadata)
    const shortName = metadata.table_name.replace(/^relation__/, '')
    const pendingSuffix =
      shortName === 'rss_feed_item__category__topic_alias'
        ? 'rss_feed_item__category__alias_pending'
        : `${shortName}_flag_pending`
    // Topic-involving election relations already get a covering (target, id) page index from
    // 0000-00-01d-topic-merge-relation-work-items.mts with the same predicate.
    const hasTopicMergePageIndex = isTopicMergeElectionRelation(metadata)
    return [
      `COMMENT ON COLUMN vote_integrity_flags."${targetColumn}" IS 'Flagged ${metadata.table_name} relation, if this flag targets that relation type.';`,
      `COMMENT ON COLUMN vote_integrity_flags."${subjectColumn}" IS 'Subject identifier paired with ${targetColumn} for referential integrity.';`,
      ...buildConstraintAddAndValidateSql(
        'vote_integrity_flags',
        `vif_${shortName}_target_fkey`,
        `FOREIGN KEY (${subjectColumn}, ${targetColumn}) REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE CASCADE`,
        metadata.table_name,
      ),
      ...buildConstraintAddAndValidateSql(
        'vote_integrity_flags',
        `vif_${shortName}_target_pair_check`,
        `CHECK ((${subjectColumn} IS NULL) = (${targetColumn} IS NULL))`,
      ),
      `CREATE UNIQUE INDEX IF NOT EXISTS ${getElectionIndexName('vote_integrity_flags', pendingSuffix)}
ON vote_integrity_flags (${targetColumn}, flag_type)
WHERE resolved_at IS NULL AND ${targetColumn} IS NOT NULL;`,
      ...(hasTopicMergePageIndex
        ? []
        : [
            `CREATE INDEX IF NOT EXISTS ${getElectionIndexName('vote_integrity_flags', `${shortName}_id`)}
ON vote_integrity_flags (${targetColumn})
WHERE ${targetColumn} IS NOT NULL;`,
          ]),
    ]
  })
  const allTargetColumns = [
    'post_id',
    'topic_id',
    'hostname_id',
    'rss_feed_item_id',
    'agent_moderation_id',
    ...electionRelations.map(getEntityRelationIntegrityTargetColumn),
  ]
  statements.push(
    ...buildConstraintAddAndValidateSql(
      'vote_integrity_flags',
      'chk_vote_integrity_flags__one_target',
      `CHECK (num_nonnulls(${allTargetColumns.join(', ')}) = 1)`,
    ),
  )
  return statements.join('\n\n')
}
