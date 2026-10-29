import { VOTE_SCHEMA_CONFIGS } from '@data-stores/psql/config-driven/utils/election-schema-config'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'

/** Every concrete ballot table, with the column naming the entity being voted on. */
export const voteTables = [
  ...VOTE_SCHEMA_CONFIGS.map(config => ({
    table: config.voteTable,
    entityColumn: config.entityIdColumn,
  })),
  ...entityRelationMetadatum.flatMap(metadata =>
    metadata.election
      ? [{ table: getEntityRelationVoteTableName(metadata), entityColumn: 'entity_relation_id' }]
      : [],
  ),
]
