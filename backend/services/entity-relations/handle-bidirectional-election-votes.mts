import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import {
  handleElectionVotes,
  type EntityRelation,
  type UpsertEntityRelationsOptions,
} from './upsert-helpers.mts'

/**
 * One vote transaction for both directions. Same-type `related` uses one relation table, so one
 * active-user fence, one sorted advisory-lock statement, and one insert cover both rows.
 */
export async function handleBidirectionalElectionVotes(
  creator: BasicUser | null,
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
  reverseRelation: EntityRelationMetadata,
  reverseRelations: EntityRelation[],
  options?: UpsertEntityRelationsOptions,
): Promise<void> {
  if (relation.table_name !== reverseRelation.table_name) {
    throw new Error(
      `Bidirectional election votes for ${relation.table_name} and ${reverseRelation.table_name} must share one relation table`,
    )
  }
  const relationsById = new Map<string, EntityRelation>()
  for (const candidate of [...relations, ...reverseRelations]) {
    if (candidate.id) relationsById.set(candidate.id, candidate)
  }
  await handleElectionVotes(creator, relation, [...relationsById.values()], options)
}
