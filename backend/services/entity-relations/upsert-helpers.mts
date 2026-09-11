import assert from 'http-assert'
import { getRegisteredElectionVoteHandler } from './election-vote-handler-registry.mts'
import type { Post, PostType } from '@voucha/types/entities/post'
import type { Topic } from '@voucha/types/entities/topic'
import type { BasicUser, PrivateUser } from '@voucha/types/entities/user' // PrivateUser used in UpsertEntityTypes
import type { EntityRelationMetadata } from './metadata.mts'
import type { QueryOptions } from '@data-stores/psql'

export type UpsertEntityTypes = Post | Topic | PrivateUser

export type EntityIdentifier = { id: string }

export type EntityRelation = {
  id?: string
  subject_id: string
  subject_type?: PostType
  object_id: string
  object_type?: PostType
  order_index?: number
  created_at: Date
  created_by_id: string
  deleted_at?: Date
  deleted_by_id?: string
  // Set by buildInsertQuery's upsert RETURNING clause: true when this row was absent or
  // soft-deleted immediately before this write (a fresh insert or a resurrection), false for a
  // no-op retry of an already-active row. Undefined for relations not produced by that query
  // (e.g. reads via query.mts). Used to gate outbound-Follow-emission side effects so a retried
  // upsert of an already-active follow does not re-send a duplicate ActivityPub Follow.
  newly_active?: boolean
}

export type InternalEntityRelationMutationResult = EntityRelation & {
  outbound_ap_follow_activity_id?: string | null
}

export function toPublicEntityRelations(
  relations: InternalEntityRelationMutationResult[],
): EntityRelation[] {
  return relations.map(({ outbound_ap_follow_activity_id: _, ...relation }) => relation)
}

export type EntityRelationOrigin = 'local' | 'remote'

export type UpsertEntityRelationsOptions = QueryOptions & {
  // whether to automatically vote for the relation
  vote?: boolean
  order_index?: number
  enqueueVoteStats?: boolean
  // Story workflows aggregate their own publication capture inside the surrounding transaction.
  capturePublication?: boolean
  // Loop prevention (Phase C): tags a write as caused by an inbound ActivityPub activity.
  // Defaults to 'local'. Callers that write relations sourced from a remote Follow/Undo(Follow)
  // must pass 'remote' so outbound-destined side effects (follow notifications, crawl enqueues,
  // discoverability enqueues) are not re-triggered by a remote-caused write.
  origin?: EntityRelationOrigin
  // Round-9 review fix: makes buildInsertQuery's ON CONFLICT DO UPDATE conditional on the row not
  // currently being soft-deleted. A separate read-then-write can't close a concurrent-delete race
  // (the read's result is stale by the time the write runs); this guard is evaluated by Postgres
  // as part of the same locked write, so a soft-delete that commits first is always observed and
  // the resurrection is skipped (zero rows returned) rather than racily overwritten. Only for
  // callers replaying a *duplicate* delivery of an already-processed write (e.g.
  // resendAcceptForDuplicateFollow) — a genuine new write (e.g. a fresh Follow activity) must
  // still resurrect an unrelated prior soft-delete unconditionally.
  skipIfDeleted?: boolean
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
