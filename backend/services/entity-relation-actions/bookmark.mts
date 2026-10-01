import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import type {
  EntityRelationEntityType,
  EntityRelationPredicateType,
} from '@services/entity-relations/config'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanBookmarkTarget } from './authorization.mts'
import type { EntityRelationActionAuthority } from './create.mts'
import { assertPostTargetAccess } from './post-target-access.mts'

export type BookmarkActionInput = {
  readonly entityType: string
  readonly entityId: string
  readonly predicate: string
}

/**
 * Sets one bookmark-class relation (save, follow, mute, block and the rest) for the current user.
 * Shared by the session REST route and credential-delegated callers, which differ only in the
 * authority: a delegated credential reaches a private post only through its exact consent scope.
 */
export async function upsertBookmarkAction(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  input: BookmarkActionInput,
) {
  assertNotSuspended(currentUser)
  const { entityType, entityId, predicate } = input
  assert(isUUID(entityId), 422, 'Invalid entity ID')
  const isBookmarkable = entityRelationMetadatum.some(
    relation =>
      relation.subject_type === 'user' &&
      relation.object_type === entityType &&
      relation.predicate === predicate &&
      relation.is_bookmark,
  )
  assert(isBookmarkable, 422, 'Invalid bookmark type.')
  const type = entityType as EntityRelationEntityType
  assert(await currentUserCanBookmarkTarget(currentUser, type, entityId), 404, 'Entity not found')
  // A first-party session keeps the ordinary visibility rule above; only a credential needs more.
  const postMutationGuard =
    type === 'post' && authority.kind === 'delegated'
      ? await assertPostTargetAccess(currentUser, authority, entityId)
      : undefined

  try {
    return await bookmarkEntity(
      currentUser,
      type,
      { id: entityId },
      predicate as EntityRelationPredicateType,
      postMutationGuard ? { postMutationGuard } : undefined,
    )
  } catch (error: unknown) {
    // FK violation: the entity does not exist.
    if ((error as { code?: string }).code === '23503') assert(false, 404, 'Entity not found')
    throw error
  }
}

/**
 * Removes one bookmark-class relation. It checks no target visibility on purpose: a viewer must be
 * able to clear a bookmark on an entity that has since become hidden, and the removal reads or
 * discloses nothing about it, so a delegated credential needs no private-content grant either.
 */
export async function deleteBookmarkAction(currentUser: PrivateUser, input: BookmarkActionInput) {
  assertNotSuspended(currentUser)
  assert(isUUID(input.entityId), 422, 'Invalid entity ID')
  await unbookmarkEntity(
    currentUser,
    input.entityType as EntityRelationEntityType,
    { id: input.entityId },
    input.predicate as EntityRelationPredicateType,
  )
}
