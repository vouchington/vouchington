import type { DirectPostEligibilityOptions } from '@modules/feed-query-builders'

/**
 * Who a relation read is for. Request readers pass the signed-in user, or `anonymous`; `system`
 * is reserved for trusted internal jobs (such as moderation) that must see relations on content
 * no viewer can read yet. Callers derive `staffRole` with `entityRelationViewerFor` in
 * `@services/users`, because that package depends on this one.
 */
export type EntityRelationViewer =
  | { readonly kind: 'system' }
  | { readonly kind: 'anonymous' }
  | {
      readonly kind: 'user'
      readonly userId: string
      readonly staffRole: 'administrator' | 'moderator' | null
    }

export const ANONYMOUS_ENTITY_RELATION_VIEWER: EntityRelationViewer = { kind: 'anonymous' }
export const SYSTEM_ENTITY_RELATION_VIEWER: EntityRelationViewer = { kind: 'system' }

/** Post access for the viewer, or null when the viewer bypasses post visibility. */
export function postEligibilityFor(
  viewer: EntityRelationViewer,
): DirectPostEligibilityOptions | null {
  switch (viewer.kind) {
    case 'system':
      return null
    case 'anonymous':
      return { currentUserId: null, isModerationStaff: false }
    case 'user':
      return { currentUserId: viewer.userId, isModerationStaff: viewer.staffRole !== null }
  }
}

/**
 * The viewer whose own anonymous authorship stays visible, or `undefined` when the viewer sees
 * every relation creator. Administrators and system readers see creators, matching
 * `maskAnonymousPost`; everyone else sees anonymous authors only on their own relations.
 */
export function anonymousAuthorMaskFor(
  viewer: EntityRelationViewer,
): { readonly viewerUserId: string | null } | undefined {
  switch (viewer.kind) {
    case 'system':
      return undefined
    case 'anonymous':
      return { viewerUserId: null }
    case 'user':
      return viewer.staffRole === 'administrator' ? undefined : { viewerUserId: viewer.userId }
  }
}
