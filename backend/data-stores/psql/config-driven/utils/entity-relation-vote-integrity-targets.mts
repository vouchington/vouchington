import {
  getEntityRelationIntegritySubjectColumn,
  getEntityRelationIntegrityTargetColumn,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'
import {
  buildCatalogGuardedColumnRepairSql,
  buildConstraintAddAndValidateSql,
  buildConstraintColumnSetRepairSql,
} from './catalog-guarded-ddl.mts'

export function createEntityRelationVoteIntegrityTargets(
  electionRelations: EntityRelationMetadata[],
): string {
  const statements = electionRelations.flatMap(metadata => {
    const targetColumn = getEntityRelationIntegrityTargetColumn(metadata)
    const subjectColumn = getEntityRelationIntegritySubjectColumn(metadata)
    const shortName = metadata.table_name.replace(/^relation__/, '')
    return [
      buildCatalogGuardedColumnRepairSql('vote_integrity_flags', targetColumn, 'UUID'),
      buildCatalogGuardedColumnRepairSql('vote_integrity_flags', subjectColumn, 'UUID'),
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
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_vif__${shortName}_flag_pending
ON vote_integrity_flags (${targetColumn}, flag_type)
WHERE resolved_at IS NULL AND ${targetColumn} IS NOT NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_vif__${shortName}_id
ON vote_integrity_flags (${targetColumn})
WHERE ${targetColumn} IS NOT NULL;`,
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
    buildConstraintColumnSetRepairSql(
      'vote_integrity_flags',
      'chk_vote_integrity_flags__one_target',
      allTargetColumns,
    ),
    ...buildConstraintAddAndValidateSql(
      'vote_integrity_flags',
      'chk_vote_integrity_flags__one_target',
      `CHECK (num_nonnulls(${allTargetColumns.join(', ')}) = 1)`,
    ),
  )
  return statements.join('\n\n')
}
