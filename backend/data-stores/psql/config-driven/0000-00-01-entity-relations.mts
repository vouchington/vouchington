import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
  entityRelationEntityTables,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'
import type { EntityRelationEntityType } from '@voucha/types/entities/entity-relations-config'
import { buildConstraintAddAndValidateSql } from './utils/catalog-guarded-ddl.mts'
import { buildCatalogGuardedNullableColumnRepairSql } from './utils/nullable-column-repair.mts'
import { createEntityRelationVoteIntegrityTargets } from './utils/entity-relation-vote-integrity-targets.mts'

export default () => {
  const tableCreation = entityRelationMetadatum.map(createEntityRelationTable).join('\n\n')
  const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)
  const relationVoteParent = createEntityRelationVoteParentTable()
  const relationVoteTables = electionRelations.map(createEntityRelationVoteTable).join('\n\n')
  const integrityTargets = createEntityRelationVoteIntegrityTargets(electionRelations)
  const relationVoteRepairs = [
    buildCatalogGuardedNullableColumnRepairSql('entity_relation_votes', 'score', 'SMALLINT', null),
    `DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'entity_relation_votes'::regclass
      AND conname = 'entity_relation_votes_relation_table_user_id_entity_relatio_key'
  ) THEN
    LOCK TABLE entity_relation_votes IN SHARE ROW EXCLUSIVE MODE;
    ALTER TABLE entity_relation_votes
      DROP CONSTRAINT entity_relation_votes_relation_table_user_id_entity_relatio_key;
  END IF;
END $$;`,
    ...buildConstraintAddAndValidateSql(
      'entity_relation_votes',
      'chk_entity_relation_votes_score_domain',
      'CHECK (score IS NULL OR score IN (-1, 0, 1))',
    ),
  ].join('\n\n')
  return [
    tableCreation,
    relationVoteParent,
    relationVoteRepairs,
    relationVoteTables,
    integrityTargets,
  ].join('\n\n')
}

function createEntityRelationTable(metadata: EntityRelationMetadata) {
  let query = `CREATE TABLE IF NOT EXISTS "${metadata.table_name}" (\n`
  const primary_keys = []
  query += `  subject_id UUID NOT NULL REFERENCES ${entityRelationEntityTables[metadata.subject_type as EntityRelationEntityType].foreign_key_table} (id) ON DELETE CASCADE,\n`
  primary_keys.push('subject_id')
  query += `  object_id UUID NOT NULL REFERENCES ${entityRelationEntityTables[metadata.object_type as EntityRelationEntityType].foreign_key_table} (id) ON DELETE CASCADE,\n`
  primary_keys.push('object_id')

  query += `    created_by_id UUID REFERENCES users ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    deleted_by_id UUID REFERENCES users ON DELETE SET NULL`
  const storesOutboundFollowActivityId = metadata.table_name === 'relation__user__follow__user'
  if (storesOutboundFollowActivityId) {
    query += `,
    outbound_ap_follow_activity_id UUID DEFAULT uuidv7()`
  }

  if (metadata.election) {
    query += `,
    id UUID NOT NULL DEFAULT uuidv7()`

    query += `,
    votes_score_up DOUBLE PRECISION NOT NULL DEFAULT 0,
    votes_score_none DOUBLE PRECISION NOT NULL DEFAULT 0,
    votes_score_down DOUBLE PRECISION NOT NULL DEFAULT 0,
    votes_count_up INT NOT NULL DEFAULT 0,
    votes_count_none INT NOT NULL DEFAULT 0,
    votes_count_down INT NOT NULL DEFAULT 0,
    votes_score_sort DOUBLE PRECISION GENERATED ALWAYS AS (fn_wilson_score_lower_bound(
      votes_score_up, votes_score_up + votes_score_none + votes_score_down
    )) STORED,
    votes_score_net DOUBLE PRECISION GENERATED ALWAYS AS (
      votes_score_up - votes_score_down
    ) STORED,
    CHECK (votes_score_up >= 0),
    CHECK (votes_score_none >= 0),
    CHECK (votes_score_down >= 0),
    CHECK (votes_count_up >= 0),
    CHECK (votes_count_none >= 0),
    CHECK (votes_count_down >= 0)`

    query += `,
    CHECK (id > subject_id)`
    query += `,
    CHECK (id > object_id)`
    query += `,
    UNIQUE (subject_id, id)`
  }

  if (metadata.order_index) {
    query += `,
    order_index BIGINT NOT NULL DEFAULT 0`
  }

  query += `,
    PRIMARY KEY (${primary_keys.join(', ')})`

  query += `\n  )`

  // Only post-subject tables are partitioned (RANGE by subject_id). User-subject tables are not
  // partitioned: they're small (<1M rows) and have no retention policy. relation__user__* was
  // HASH-partitioned once (HASH is now forbidden repo-wide); buildPrivacyFilter's object_id
  // broadcast checks scanned all 8 hash partitions 5+ times per feed query — see
  // backend/services/feeds/README.md, "Performance" section, for the measured incident.
  if (metadata.subject_type === 'post') {
    query += ` PARTITION BY RANGE (subject_id)`
  }

  query += `;\n\n`

  const repair = storesOutboundFollowActivityId
    ? buildCatalogGuardedNullableColumnRepairSql(
        metadata.table_name,
        'outbound_ap_follow_activity_id',
        'UUID',
        'uuidv7()',
      )
    : ''
  return `${query.trim()}\n${repair}`
}

function createEntityRelationVoteTable(metadata: EntityRelationMetadata): string {
  const voteTable = getEntityRelationVoteTableName(metadata)
  return `CREATE TABLE IF NOT EXISTS ${voteTable}
PARTITION OF entity_relation_votes (
  FOREIGN KEY (subject_id, entity_relation_id) REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE CASCADE
)
FOR VALUES IN ('${metadata.table_name}')
PARTITION BY RANGE (entity_relation_id);

CREATE TABLE IF NOT EXISTS ${voteTable}__default
PARTITION OF ${voteTable} DEFAULT;`
}

function createEntityRelationVoteParentTable(): string {
  return `CREATE TABLE IF NOT EXISTS entity_relation_votes (
  relation_table TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  subject_id UUID NOT NULL,
  entity_relation_id UUID NOT NULL,
  id UUID DEFAULT uuidv7() NOT NULL,
  score SMALLINT,
  ip_address INET,
  device_id UUID,
  session_id UUID,
  user_agent_id UUID REFERENCES vote_user_agents ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  PRIMARY KEY (relation_table, entity_relation_id, id)
) PARTITION BY LIST (relation_table);

CREATE INDEX IF NOT EXISTS idx_entity_relation_votes__relation__user__id
ON entity_relation_votes (entity_relation_id, user_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_entity_relation_votes__relation__id
ON entity_relation_votes (entity_relation_id, id);

CREATE INDEX IF NOT EXISTS idx_entity_relation_votes__user__relation__id
ON entity_relation_votes (user_id, entity_relation_id, id DESC);`
}
