import type { EntityRelationViewer } from '@services/entity-relations/viewer'
import { isAdminUser, isModeratorUser } from './authorization.mts'
import type { PrivateUser } from './types.mts'

/** Describes the request's user for entity-relation reads, which cannot import role helpers. */
export function entityRelationViewerFor(currentUser: PrivateUser | null): EntityRelationViewer {
  if (!currentUser) return { kind: 'anonymous' }
  let staffRole: 'administrator' | 'moderator' | null = null
  if (isAdminUser(currentUser)) staffRole = 'administrator'
  else if (isModeratorUser(currentUser)) staffRole = 'moderator'
  return { kind: 'user', userId: currentUser.id, staffRole }
}
