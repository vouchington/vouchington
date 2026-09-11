import {
  entityRelationMetadatum,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'

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
 */
export default () => {
  return [
    createPostCategoryTopicSubjectOrderIndexRepairs(),
    ...entityRelationMetadatum.map(createEntityRelationIndexes),
  ].join('\n\n')
}

function createPostCategoryTopicSubjectOrderIndexRepairs(): string {
  return `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_relation__post__category__topic__subject__best'
      AND lower(indexdef) NOT LIKE '%object_id desc%'
  ) THEN
    DROP INDEX IF EXISTS idx_relation__post__category__topic__subject__best;
    CREATE INDEX IF NOT EXISTS idx_relation__post__category__topic__subject__best
    ON "relation__post__category__topic" (${ACTIVE_SUBJECT_BEST_INDEX_COLUMNS})
    WHERE deleted_at IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_relation__post__category__topic__subject__newest'
      AND lower(indexdef) NOT LIKE '%object_id desc%'
  ) THEN
    DROP INDEX IF EXISTS idx_relation__post__category__topic__subject__newest;
    CREATE INDEX IF NOT EXISTS idx_relation__post__category__topic__subject__newest
    ON "relation__post__category__topic" (${ACTIVE_SUBJECT_NEWEST_INDEX_COLUMNS})
    WHERE deleted_at IS NULL;
  END IF;
END $$;
`.trim()
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
CREATE INDEX IF NOT EXISTS idx_${metadata.table_name}__id
ON "${metadata.table_name}" (id);

CREATE INDEX IF NOT EXISTS idx_${metadata.table_name}__votes_score_sort__id
ON "${metadata.table_name}" (votes_score_sort DESC, id);

CREATE INDEX IF NOT EXISTS idx_${metadata.table_name}__votes_score_sort__pos__id
ON "${metadata.table_name}" (votes_score_sort DESC, id)
WHERE votes_score_net > 0;

CREATE INDEX IF NOT EXISTS idx_${metadata.table_name}__subject__best
ON "${metadata.table_name}" (${ACTIVE_SUBJECT_BEST_INDEX_COLUMNS})
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_${metadata.table_name}__trending_topics
ON "${metadata.table_name}" (id, object_id)
WHERE deleted_at IS NULL AND votes_score_net > 0;
`
  }

  query += `
CREATE INDEX IF NOT EXISTS idx_${metadata.table_name}__subject__newest
ON "${metadata.table_name}" (${ACTIVE_SUBJECT_NEWEST_INDEX_COLUMNS})
WHERE deleted_at IS NULL;
`

  // Create order index (if enabled)
  if (metadata.order_index) {
    query += `
CREATE INDEX IF NOT EXISTS idx_${metadata.table_name}__order_index
ON "${metadata.table_name}" (${subjectColumns}, order_index ASC, object_id ASC);
`
  }

  // Create reverse lookup index (for all tables)
  query += `
CREATE INDEX IF NOT EXISTS idx_${metadata.table_name}__reverse_index
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
    FOR EACH ROW EXECUTE FUNCTION fn_record_story_post_related_url_projection_relation_mutation();
  END IF;
END $$;
`
  }

  return query.trim()
}
