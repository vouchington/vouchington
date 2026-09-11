import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import {
  handleElectionVotes,
  type EntityRelation,
  type UpsertEntityRelationsOptions,
} from './upsert-helpers.mts'
import { orderBidirectionalElectionVoteWrites } from './election-vote-order.mts'

export async function handleBidirectionalElectionVotes(
  creator: BasicUser | null,
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
  reverseRelation: EntityRelationMetadata,
  reverseRelations: EntityRelation[],
  options?: UpsertEntityRelationsOptions,
): Promise<void> {
  const electionVoteWrites = orderBidirectionalElectionVoteWrites([
    {
      relationTable: relation.table_name,
      relationIds: relations.flatMap(candidate => (candidate.id ? [candidate.id] : [])),
      value: { relation, relations },
    },
    {
      relationTable: reverseRelation.table_name,
      relationIds: reverseRelations.flatMap(candidate => (candidate.id ? [candidate.id] : [])),
      value: { relation: reverseRelation, relations: reverseRelations },
    },
  ])
  // Both directions use the same globally deterministic order before their vote helper acquires
  // transaction-scoped advisory locks. This also avoids concurrent queries on a supplied client.
  for (const electionVoteWrite of electionVoteWrites) {
    // oxlint-disable-next-line no-await-in-loop -- deterministic advisory-lock order prevents inverse-write deadlocks
    await handleElectionVotes(
      creator,
      electionVoteWrite.value.relation,
      electionVoteWrite.value.relations,
      options,
    )
  }
}
