import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '../../backend/types/entities/entity-relations-metadata.mts'

export const electedVoteTables = entityRelationMetadatum.flatMap(metadata =>
  metadata.election ? [getEntityRelationVoteTableName(metadata)] : [],
)

type ReviewedIds = [string, string][]

export function reviewed(reason: string, keys: readonly string[]): ReviewedIds {
  return keys.map(key => [key, reason])
}

// Opaque ids with no owning row to reference: client tokens, traversal cursors, protocol ids.
