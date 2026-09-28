import assert from 'http-assert'
import { getRegisteredElectionVoteHandler } from './election-vote-handler-registry.mts'
import type { Post, PostType } from '@voucha/types/entities/post'
import type { Topic } from '@voucha/types/entities/topic'
import type { BasicUser, PrivateUser } from '@voucha/types/entities/user' // PrivateUser used in UpsertEntityTypes
import type { EntityRelationMetadata } from './metadata.mts'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql'
import type { EntityRelation, UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'
export type {
  EntityRelation,
  EntityRelationOrigin,
  UpsertEntityRelationsOptions,
} from './upsert-helpers-types.mts'

export type UpsertEntityTypes = Post | Topic | PrivateUser

export type EntityIdentifier = { id: string }

export type InternalEntityRelationMutationResult = EntityRelation & {
  outbound_ap_follow_activity_id?: string | null
}

export function toPublicEntityRelations(
  relations: InternalEntityRelationMutationResult[],
): EntityRelation[] {
  return relations.map(({ outbound_ap_follow_activity_id: _, ...relation }) => relation)
}

export async function handleElectionVotes(
  // null only for remote-origin writes — see UpsertEntityRelationsOptions['origin'] above.
  creator: BasicUser | null,
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
  options?: UpsertEntityRelationsOptions,
): Promise<void> {
  if (options?.vote === false || !relation.election) return
  // No relation config today points an election-backed relation at a null (remote-actor)
  // creator — throw rather than silently skip a vote if that assumption is ever violated.
  assert(creator, 500, 'Election-backed entity relations require a non-null creator')

  await getRegisteredElectionVoteHandler()(creator, relation, relations, options)
}

export function getEntityId(entity: UpsertEntityTypes | EntityIdentifier): string {
  if ('id' in entity && typeof entity.id === 'string') return entity.id
  throw new TypeError('Unsupported entity identifier')
}
