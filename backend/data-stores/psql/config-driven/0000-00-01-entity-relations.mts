import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
  entityRelationEntityTables,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'
import type { EntityRelationEntityType } from '@voucha/types/entities/entity-relations-config'
import {
  createVoteDefaultPartitionSql,
  createVoteIndexesSql,
} from './utils/election-vote-table-sql.mts'
import {
  getElectionConstraintClause,
  getElectionForeignKeyName,
} from './utils/election-sql-identifiers.mts'
import { createEntityRelationVoteIntegrityTargets } from './utils/entity-relation-vote-integrity-targets.mts'
import { createRetainedEntityRelationImpacts } from './utils/retained-entity-relation-impacts.mts'

/** @public loaded by path by the config-driven migration runner */
export default () => {
  const tableCreation = entityRelationMetadatum.map(createEntityRelationTable).join('\n\n')
  const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)
  const relationVoteView = createEntityRelationVoteView(electionRelations)
  const relationVoteTables = electionRelations.map(createEntityRelationVoteTable).join('\n\n')
  const integrityTargets = createEntityRelationVoteIntegrityTargets(electionRelations)
  const retainedImpacts = createRetainedEntityRelationImpacts(electionRelations)
  return [
    tableCreation,
    relationVoteTables,
    relationVoteView,
    integrityTargets,
    retainedImpacts,
  ].join('\n\n')
}

function createEntityRelationTable(metadata: EntityRelationMetadata) {
  let query = `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS "${metadata.table_name}" (\n`
  const primary_keys = []
  query += `  subject_id UUID NOT NULL ${getElectionConstraintClause(metadata.table_name, ['subject_id'], 'fk')}REFERENCES ${entityRelationEntityTables[metadata.subject_type as EntityRelationEntityType].foreign_key_table} (id) ON DELETE CASCADE,\n`
  primary_keys.push('subject_id')
  query += `  object_id UUID NOT NULL ${getElectionConstraintClause(metadata.table_name, ['object_id'], 'fk')}REFERENCES ${entityRelationEntityTables[metadata.object_type as EntityRelationEntityType].foreign_key_table} (id) ON DELETE CASCADE,\n`
  primary_keys.push('object_id')

  query += `    created_by_id UUID ${getElectionConstraintClause(metadata.table_name, ['created_by_id'], 'fk')}REFERENCES users ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    deleted_by_id UUID ${getElectionConstraintClause(metadata.table_name, ['deleted_by_id'], 'fk')}REFERENCES users ON DELETE SET NULL`
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
    ${getElectionConstraintClause(metadata.table_name, ['votes_score_up'], 'chk')}CHECK (votes_score_up >= 0),
    ${getElectionConstraintClause(metadata.table_name, ['votes_score_none'], 'chk')}CHECK (votes_score_none >= 0),
    ${getElectionConstraintClause(metadata.table_name, ['votes_score_down'], 'chk')}CHECK (votes_score_down >= 0),
    ${getElectionConstraintClause(metadata.table_name, ['votes_count_up'], 'chk')}CHECK (votes_count_up >= 0),
    ${getElectionConstraintClause(metadata.table_name, ['votes_count_none'], 'chk')}CHECK (votes_count_none >= 0),
    ${getElectionConstraintClause(metadata.table_name, ['votes_count_down'], 'chk')}CHECK (votes_count_down >= 0)`

    query += `,
    CHECK (id > subject_id)`
    query += `,
    CHECK (id > object_id)`
    query += `,
    ${getElectionConstraintClause(metadata.table_name, ['subject_id', 'id'], 'uq')}UNIQUE (subject_id, id)`
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
  // docs/overview/architecture/services/feeds/README.md, "Performance" section, for the measured incident.
  if (metadata.subject_type === 'post') {
    query += ` PARTITION BY RANGE (subject_id)`
  }

  query += `;\n\n`

  return query.trim()
}

function createEntityRelationVoteTable(metadata: EntityRelationMetadata): string {
  const voteTable = getEntityRelationVoteTableName(metadata)
  return `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS ${voteTable} (
  user_id UUID NOT NULL ${getElectionConstraintClause(voteTable, ['user_id'], 'fk')}REFERENCES users ON DELETE CASCADE,
  subject_id UUID NOT NULL,
  entity_relation_id UUID NOT NULL,
  id UUID DEFAULT uuidv7() NOT NULL,
  score SMALLINT ${getElectionConstraintClause(voteTable, ['score'], 'chk')}CHECK (score IS NULL OR score IN (-1, 0, 1)),
  score_is_neutral BOOLEAN NOT NULL DEFAULT FALSE CHECK (NOT score_is_neutral OR score IS NOT DISTINCT FROM 0),
  score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE CHECK (NOT score_is_semantic OR score IS NOT NULL),
  ip_address INET,
  device_id UUID,
  session_id UUID,
  user_agent_id UUID ${getElectionConstraintClause(voteTable, ['user_agent_id'], 'fk')}REFERENCES user_agent_strings ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  PRIMARY KEY (entity_relation_id, id),
  CONSTRAINT ${getElectionForeignKeyName(voteTable, 'subject_entity_relation')} FOREIGN KEY (subject_id, entity_relation_id) REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE CASCADE
) PARTITION BY RANGE (entity_relation_id);

${createVoteDefaultPartitionSql(voteTable)}

${createVoteIndexesSql(voteTable, 'entity_relation_id')}

COMMENT ON TABLE ${voteTable} IS 'Append-only votes for the concrete ${metadata.table_name} elected relation.';
COMMENT ON COLUMN ${voteTable}.score_is_neutral IS 'Explicit neutral provenance; binary relation vote producers leave this false.';
COMMENT ON COLUMN ${voteTable}.score_is_semantic IS 'Explicit semantic score provenance; binary relation vote producers leave this false.';
COMMENT ON COLUMN ${voteTable}.score IS 'Binary relation ballot or retained clear event; nullable events clear the current ballot.';
COMMENT ON COLUMN ${voteTable}.ip_address IS 'Audit IP address captured with this ballot event.';
COMMENT ON COLUMN ${voteTable}.device_id IS 'Opaque client device token with no durable owner row.';
COMMENT ON COLUMN ${voteTable}.session_id IS 'Opaque client session token with no durable owner row.';
COMMENT ON COLUMN ${voteTable}.user_agent_id IS 'Shared bounded user-agent string captured with this ballot event.';
COMMENT ON COLUMN ${voteTable}.subject_id IS 'Authoritative subject paired with the concrete elected relation identifier.';
COMMENT ON COLUMN ${voteTable}.entity_relation_id IS 'Concrete elected relation identifier and UUIDv7 partition key.';`
}

function createEntityRelationVoteView(relations: EntityRelationMetadata[]): string {
  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'elected_entity_relations') THEN
    CREATE TYPE elected_entity_relations AS ENUM (${relations.map(metadata => `'${metadata.table_name}'`).join(', ')});
  END IF;
END $$;

CREATE OR REPLACE VIEW view_entity_relation_votes AS
${relations
  .map(
    metadata => `SELECT '${metadata.table_name}'::elected_entity_relations AS entity_relation,
  user_id, subject_id, entity_relation_id, id, score, score_is_neutral, score_is_semantic, ip_address, device_id, session_id, user_agent_id, created_at
FROM ${getEntityRelationVoteTableName(metadata)}`,
  )
  .join('\nUNION ALL\n')};

COMMENT ON VIEW view_entity_relation_votes IS 'Current concrete relation vote ledgers combined for cross-family reads; writes target each concrete table.';`
}
