import {
  entityRelationEntityTables,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'
import type { EntityRelationEntityType } from '@voucha/types/entities/entity-relations-config'
import type { VoteSchemaConfig } from './election-schema-config.mts'
import { getElectionIndexName } from './election-sql-identifiers.mts'
export function createVoteDefaultPartitionSql(voteTable: string): string {
  return `CREATE TABLE IF NOT EXISTS ${voteTable}__default
PARTITION OF ${voteTable} DEFAULT;`
}

export function createVoteIndexesSql(voteTable: string, entityIdColumn: string): string {
  const key = entityIdColumn === 'entity_relation_id' ? 'relation' : entityIdColumn
  const actor = entityIdColumn === 'entity_relation_id' ? 'user' : 'user_id'
  return `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(voteTable, `${key}__${actor}__id`)}
ON ${voteTable} (${entityIdColumn}, user_id, id DESC);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(voteTable, `${key}__id`)}
ON ${voteTable} (${entityIdColumn}, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS ${getElectionIndexName(voteTable, `${actor}__${key}__id`)}
ON ${voteTable} (user_id, ${entityIdColumn}, id DESC);`
}

export function createEntityRelationComments(metadata: EntityRelationMetadata): string {
  const subject =
    entityRelationEntityTables[metadata.subject_type as EntityRelationEntityType].foreign_key_table
  const object =
    entityRelationEntityTables[metadata.object_type as EntityRelationEntityType].foreign_key_table
  const columns: Record<string, string> = {
    subject_id: `Concrete relation subject in ${subject}.`,
    object_id: `Concrete relation object in ${object}.`,
  }
  if (metadata.order_index) columns.order_index = 'Ordering position within the subject relation.'
  if (metadata.table_name === 'relation__user__follow__user')
    columns.outbound_activitypub_follow_activity_id =
      'Stable outbound ActivityPub Follow protocol identity.'
  if (metadata.election) {
    for (const direction of ['up', 'none', 'down']) {
      columns[`votes_score_${direction}`] = `Weighted ${direction} ballot tally for this relation.`
      columns[`votes_count_${direction}`] =
        `Number of current ${direction} ballots for this relation.`
    }
    columns.votes_score_sort = 'Generated Wilson score used to rank the relation.'
    columns.votes_score_net = 'Generated net weighted ballot score.'
  }
  return createTableComments(
    metadata.table_name,
    `${metadata.subject_type} ${metadata.predicate} ${metadata.object_type} relations. ${metadata.description}`,
    columns,
  )
}

export function createEntityVoteComments(config: VoteSchemaConfig): string {
  const columns: Record<string, string> = {
    user_id: 'User who cast this ballot event.',
    [config.entityIdColumn]: `Concrete ballot target in ${config.entityTable}.`,
    score: 'Ballot score; nullable events clear the current ballot.',
    ip_address: 'Audit IP address captured with the ballot event.',
    device_id: 'Opaque client device token with no durable owner row.',
    session_id: 'Opaque client session token with no durable owner row.',
    user_agent_string_id: 'Shared bounded user-agent string captured with the ballot event.',
    ...config.voteAdditionalColumnComments,
  }
  if (config.tracksNeutralScore) columns.score_is_neutral = 'Explicit neutral ballot provenance.'
  if (config.tracksSemanticScore) columns.score_is_semantic = 'Explicit semantic ballot provenance.'
  return createTableComments(
    config.voteTable,
    `Append-only ballot events for ${config.entityTable}.`,
    columns,
  )
}

function createTableComments(
  table: string,
  description: string,
  columns: Record<string, string>,
): string {
  const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`
  return [
    `COMMENT ON TABLE ${table} IS ${quoted(description)};`,
    ...Object.entries(columns).map(
      ([column, comment]) => `COMMENT ON COLUMN ${table}.${column} IS ${quoted(comment)};`,
    ),
  ].join('\n')
}
