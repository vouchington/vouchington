import {
  getElectionConstraintClause,
  getElectionIndexName,
  getElectionTriggerName,
} from './election-sql-identifiers.mts'
import {
  getEntityRelationIntegrityTargetColumn,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'
import { buildConstraintAddAndValidateSql } from './catalog-guarded-ddl.mts'

export function createRetainedEntityRelationImpacts(
  electionRelations: EntityRelationMetadata[],
): string {
  const retainedOwners = electionRelations.map(metadata => {
    const retained = `retained_${metadata.table_name}`
    const root = `retained_${metadata.subject_type}_identities`
    return `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS ${retained} (
  subject_id UUID NOT NULL ${getElectionConstraintClause(retained, ['subject_id'], 'fk')}REFERENCES ${root} (id) ON DELETE RESTRICT,
  id UUID NOT NULL,
  PRIMARY KEY (subject_id, id)
);

COMMENT ON TABLE ${retained} IS 'Concrete retained identity for an elected relation captured by durable deletion work.';
COMMENT ON COLUMN ${retained}.subject_id IS 'Concrete subject root paired with this retained relation identifier.';`
  })
  const cleanupProgress = `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS retained_relation_identity_cleanup_progress (
  entity_relation elected_entity_relations PRIMARY KEY,
  cursor_subject_id UUID,
  cursor_relation_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((cursor_subject_id IS NULL) = (cursor_relation_id IS NULL))
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER ${getElectionTriggerName('retained_relation_identity_cleanup_progress', 'updated_at')}
BEFORE UPDATE ON retained_relation_identity_cleanup_progress
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE retained_relation_identity_cleanup_progress IS 'One operational keyset cursor per metadata-declared elected relation family.';
COMMENT ON COLUMN retained_relation_identity_cleanup_progress.entity_relation IS 'Metadata family selector for cleanup, not a persisted relation reference.';
COMMENT ON COLUMN retained_relation_identity_cleanup_progress.cursor_subject_id IS 'Last scanned subject position, not a durable relationship.';
COMMENT ON COLUMN retained_relation_identity_cleanup_progress.cursor_relation_id IS 'Last scanned relation position, not a durable relationship.';`
  const targetColumns = electionRelations.map(getEntityRelationIntegrityTargetColumn)
  const impactCreator = `CREATE TABLE IF NOT EXISTS user_deletion_relation_impacts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  request_id UUID NOT NULL REFERENCES user_deletion_requests ON DELETE CASCADE,
  subject_id UUID NOT NULL,
${targetColumns.map(column => `  ${column} UUID,`).join('\n')}
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recomputed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_user_deletion_relation_impacts_one_target
    CHECK (num_nonnulls(${targetColumns.join(', ')}) = 1),
  UNIQUE (request_id, id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'user_deletion_relation_impacts'::regclass
      AND tgname = 'trigger_user_deletion_relation_impacts_updated_at'
  ) THEN
    CREATE TRIGGER trigger_user_deletion_relation_impacts_updated_at
    BEFORE UPDATE ON user_deletion_relation_impacts
    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_deletion_relation_impacts__pending
ON user_deletion_relation_impacts (request_id, id)
WHERE recomputed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_deletion_relation_impacts__recomputed_audit
ON user_deletion_relation_impacts (request_id, id)
WHERE recomputed_at IS NOT NULL;

COMMENT ON TABLE user_deletion_relation_impacts IS 'Typed affected elected relations captured from vote DELETE RETURNING for durable recomputation.';
COMMENT ON COLUMN user_deletion_relation_impacts.request_id IS 'Owning durable deletion request.';
COMMENT ON COLUMN user_deletion_relation_impacts.subject_id IS 'Authoritative relation subject captured with the deleted vote.';
COMMENT ON COLUMN user_deletion_relation_impacts.recorded_at IS 'Timestamp when deletion captured the relation for durable recomputation.';
COMMENT ON COLUMN user_deletion_relation_impacts.recomputed_at IS 'Timestamp when all derived effects for the captured relation completed.';`

  const targets = electionRelations.flatMap(metadata => {
    const column = getEntityRelationIntegrityTargetColumn(metadata)
    const short = metadata.table_name.replace(/^relation__/, '')
    const retained = `retained_${metadata.table_name}`
    const indexSuffix =
      short === 'rss_feed_item__category__topic_alias'
        ? 'rss_feed_item__category__alias_target'
        : `${short}_target`
    return [
      `COMMENT ON COLUMN user_deletion_relation_impacts.${column} IS 'Retained ${metadata.table_name} identity for this impact.';`,
      ...buildConstraintAddAndValidateSql(
        'user_deletion_relation_impacts',
        `udri_${short}_target_fkey`,
        `FOREIGN KEY (subject_id, ${column}) REFERENCES ${retained} (subject_id, id) ON DELETE RESTRICT`,
        retained,
      ),
      `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS ${getElectionIndexName('user_deletion_relation_impacts', indexSuffix)}
ON user_deletion_relation_impacts (subject_id, ${column}, request_id)
WHERE ${column} IS NOT NULL;`,
    ]
  })

  const externalPointer = [
    ...buildConstraintAddAndValidateSql(
      'user_deletion_external_works',
      'udew_relation_impact_fkey',
      `FOREIGN KEY (request_id, relation_impact_id)
REFERENCES user_deletion_relation_impacts (request_id, id)
ON DELETE SET NULL (relation_impact_id)`,
      'user_deletion_relation_impacts',
    ),
  ]

  return [...retainedOwners, cleanupProgress, impactCreator, ...targets, ...externalPointer].join(
    '\n\n',
  )
}
