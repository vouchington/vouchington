import { createCodedError } from '@modules/on-error/create-coded-error'
import { ENTITY_RELATION_ELECTION_HANDLER_UNREGISTERED } from '@modules/on-error/error-codes'
import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityRelation, UpsertEntityRelationsOptions } from './upsert-helpers.mts'

export type ElectionVoteHandler = (
  creator: BasicUser,
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
  options?: UpsertEntityRelationsOptions,
) => Promise<void>

let registeredHandler: ElectionVoteHandler | null = null

// @services/elections-votes registers its handler here as a side effect of module load
// (see backend/services/elections-votes/entity-relation/register-election-vote-handler.mts)
// so entity-relations never imports elections-votes directly.
export function registerElectionVoteHandler(handler: ElectionVoteHandler): void {
  registeredHandler = handler
}

// Internal to entity-relations: only upsert-helpers.mts should call this. Throws instead of
// letting a vote-backed relation write silently skip its vote when the registration above
// never ran (e.g. a missing side-effect import at process boot).
export function getRegisteredElectionVoteHandler(): ElectionVoteHandler {
  if (!registeredHandler) {
    throw createCodedError(
      500,
      'No election vote handler registered for entity relations; @services/elections-votes must be imported for side effects before vote-backed relation writes occur',
      ENTITY_RELATION_ELECTION_HANDLER_UNREGISTERED,
    )
  }
  return registeredHandler
}
