import type { DirectPostEligibilityOptions } from '@modules/feed-query-builders'

/**
 * Who a relation read is for. Request readers pass the signed-in user, or `anonymous`.
 * Callers derive `staffRole` with `entityRelationViewerFor` in
 * `@services/users`, because that package depends on this one.
 */
export type EntityRelationViewer =
  | { readonly kind: 'anonymous' }
  | {
      readonly kind: 'user'
      readonly userId: string
      readonly staffRole: 'administrator' | 'moderator' | null
    }

export const ANONYMOUS_ENTITY_RELATION_VIEWER: EntityRelationViewer = { kind: 'anonymous' }

/** Post access for the viewer. */
export function postEligibilityFor(viewer: EntityRelationViewer): DirectPostEligibilityOptions {
  let switchResult: DirectPostEligibilityOptions
  switch (viewer.kind) {
    case 'anonymous':
      switchResult = { currentUserId: null, isModerationStaff: false }
      break
    case 'user':
      return { currentUserId: viewer.userId, isModerationStaff: viewer.staffRole !== null }
  }
  return switchResult
}

/**
 * The viewer whose own anonymous authorship stays visible, or `undefined` when the viewer sees
 * every relation creator. Administrators see creators, matching
 * `maskAnonymousPost`; everyone else sees anonymous authors only on their own relations.
 */
export function anonymousAuthorMaskFor(
  viewer: EntityRelationViewer,
): { readonly viewerUserId: string | null } | undefined {
  let switchResult: { readonly viewerUserId: string | null } | undefined
  switch (viewer.kind) {
    case 'anonymous':
      switchResult = { viewerUserId: null }
      break
    case 'user':
      return viewer.staffRole === 'administrator' ? undefined : { viewerUserId: viewer.userId }
  }
  return switchResult
}
