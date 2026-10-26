import {
  entityRelationMetadatum,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'
import { getElectionIndexName } from './utils/election-sql-identifiers.mts'
import { buildConstraintAddAndValidateSql } from '@vouchington/postgres/catalog-guarded-ddl'

const ACTIVE_SUBJECT_BEST_INDEX_COLUMNS =
  'subject_id, votes_score_sort DESC, created_at DESC, object_id DESC'
const ACTIVE_SUBJECT_NEWEST_INDEX_COLUMNS = 'subject_id, created_at DESC, object_id DESC'

/**
 * Creates indexes and triggers for entity relation tables.
 *
 * This runs AFTER tables and partitions are created (in 0000-00-00-entity-relations.mts)
 * to avoid "column does not exist" errors when creating indexes on partitioned tables.
 *
 * PostgreSQL requires all partitions to exist before creating indexes on partitioned tables,
 * because it propagates the index definition to all partitions.
 *
 * loaded by path by the config-driven migration runner
 */
export default function generateEntityRelationIndexesSql(): string {
  return entityRelationMetadatum.map(createEntityRelationIndexes).join('\n\n')
}

function createEntityRelationIndexes(metadata: EntityRelationMetadata): string {
  let query = ''

  const subjectColumns = 'subject_id'
  const objectColumns = 'object_id'

  // Create vote sort indexes for election-capable tables
  // Note: UNIQUE INDEX on id alone is not valid for partitioned tables (partition key must be included).
  // UUIDv7 id values are probabilistically unique without an enforced constraint.
  if (metadata.election) {
    query += `
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(metadata.table_name, 'id')}
ON "${metadata.table_name}" (id);

CREATE INDEX IF NOT EXISTS ${getElectionIndexName(metadata.table_name, 'votes_score_sort__id')}
ON "${metadata.table_name}" (votes_score_sort DESC, id);

CREATE INDEX IF NOT EXISTS ${getElectionIndexName(metadata.table_name, 'positive_score__id')}
ON "${metadata.table_name}" (votes_score_sort DESC, id)
WHERE votes_score_net > 0;

CREATE INDEX IF NOT EXISTS ${getElectionIndexName(metadata.table_name, 'subject__best')}
ON "${metadata.table_name}" (${ACTIVE_SUBJECT_BEST_INDEX_COLUMNS})
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ${getElectionIndexName(metadata.table_name, 'trending_topics')}
ON "${metadata.table_name}" (id, object_id)
WHERE deleted_at IS NULL AND votes_score_net > 0;
`
  }

  query += `
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(metadata.table_name, 'subject__newest')}
ON "${metadata.table_name}" (${ACTIVE_SUBJECT_NEWEST_INDEX_COLUMNS})
WHERE deleted_at IS NULL;
`

  // Create order index (if enabled)
  if (metadata.order_index) {
    query += `
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(metadata.table_name, 'order_index')}
ON "${metadata.table_name}" (${subjectColumns}, order_index ASC, object_id ASC);
`
  }

  // Create reverse lookup index (for all tables)
  query += `
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(metadata.table_name, 'reverse_index')}
ON "${metadata.table_name}" (${objectColumns}, ${subjectColumns});
`

  // Emit any extra indexes defined on the relation config
  for (const extraIndex of metadata.extra_indexes) {
    query += `\n${extraIndex}\n`
  }

  if (metadata.table_name === 'relation__post__related__url') {
    query += `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'relation__post__related__url'::regclass
      AND tgname = 'trigger_story_post_related_url_projection_relation_mutation'
  ) THEN
    CREATE TRIGGER trigger_story_post_related_url_projection_relation_mutation
    AFTER INSERT OR UPDATE OF deleted_at, created_at
    ON relation__post__related__url
    FOR EACH ROW EXECUTE FUNCTION fn_project_story_post_related_url_relation_mutation();
  END IF;
END $$;
`
    // The mutation fence table is created by an earlier SQL migration, before this relation table.
    query += `\n${buildConstraintAddAndValidateSql(
      'story_post_related_url_projection_relation_mutations',
      'story_post_url_projection_mutations_relation_fkey',
      'FOREIGN KEY (post_id, relation_id) REFERENCES relation__post__related__url (subject_id, id) ON DELETE CASCADE',
      'relation__post__related__url',
    ).join('\n')}\n`
  }

  if (metadata.table_name === 'relation__remote_actor__follow__user') {
    const relation = metadata.table_name
    const constraint = 'fk_remote_follow__inbound_follow_activity_row_id'
    // The retained Follow identity is created in a fixed migration, while these parents live
    // in separate files. Attach and validate their foreign keys after all tables exist.
    for (const parent of [
      {
        name: 'activitypub_remote_follow_activities_remote_actor_id_fkey',
        table: 'remote_actors',
        definition: 'FOREIGN KEY (remote_actor_id) REFERENCES remote_actors(id) ON DELETE CASCADE',
      },
      {
        name: 'activitypub_remote_follow_activities_target_user_id_fkey',
        table: 'users',
        definition: 'FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE',
      },
    ]) {
      query += `\n${buildConstraintAddAndValidateSql(
        'activitypub_remote_follow_activities',
        parent.name,
        parent.definition,
        parent.table,
      ).join('\n')}\n`
      query += `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'activitypub_remote_follow_activities'::regclass
      AND conname = '${parent.name}'
      AND convalidated
      AND pg_get_constraintdef(oid, true) = '${parent.definition}'
  ) THEN
    RAISE EXCEPTION 'Remote Follow identity parent FK is missing, unvalidated, or has an unexpected definition: ${parent.name}';
  END IF;
END $$;
`
    }
    // Expiring an old terminal identity clears only its optional cycle pointer; actor and target
    // remain the relation identity. Active cycles are never selected by terminal cleanup.
    const definition =
      'FOREIGN KEY (subject_id, object_id, inbound_follow_activity_row_id) REFERENCES activitypub_remote_follow_activities(remote_actor_id, target_user_id, id) ON DELETE SET NULL (inbound_follow_activity_row_id) DEFERRABLE INITIALLY DEFERRED'
    query += `\n${buildConstraintAddAndValidateSql(
      relation,
      constraint,
      definition,
      'activitypub_remote_follow_activities',
    ).join('\n')}\n`
    query += `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '${relation}'::regclass
      AND conname = '${constraint}'
      AND convalidated
      AND pg_get_constraintdef(oid, true) =
        'FOREIGN KEY (subject_id, object_id, inbound_follow_activity_row_id) REFERENCES activitypub_remote_follow_activities(remote_actor_id, target_user_id, id) ON DELETE SET NULL (inbound_follow_activity_row_id) DEFERRABLE INITIALLY DEFERRED'
  ) THEN
    RAISE EXCEPTION 'Remote Follow activity FK is missing, unvalidated, or has an unexpected definition';
  END IF;
END $$;
COMMENT ON COLUMN ${relation}.inbound_follow_activity_row_id IS 'Current inbound Follow activity cycle; expiring a terminal identity clears this optional pointer and never authorizes the relation.';
`
  }

  return query.trim()
}
