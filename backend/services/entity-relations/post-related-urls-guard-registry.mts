import { createCodedError } from '@modules/on-error/create-coded-error'
import { ENTITY_RELATION_POST_RELATED_URLS_GUARD_UNREGISTERED } from '@modules/on-error/error-codes'
import type { QueryOptions } from '@data-stores/psql/types'
import type { BasicUser } from '@voucha/types/entities/user'

export type PostRelatedUrlsGuard = (
  creator: BasicUser,
  postId: string,
  urlIds: string[],
  options?: QueryOptions,
) => Promise<void>

let registeredGuard: PostRelatedUrlsGuard | null = null

// @services/posts registers its guard here as a side effect of module load
// (see backend/services/posts/register-post-related-urls-guard.mts) so entity-relations never
// imports posts or communities directly.
export function registerPostRelatedUrlsGuard(guard: PostRelatedUrlsGuard): void {
  registeredGuard = guard
}

export function unregisterPostRelatedUrlsGuardForTest(): void {
  registeredGuard = null
}

// Internal to entity-relations: only assert-post-related-urls-allowed.mts should call this.
// Throws instead of letting a post/url relation write silently skip the community link
// restriction check when the registration above never ran (e.g. a missing side-effect import
// at process boot).
export function getRegisteredPostRelatedUrlsGuard(): PostRelatedUrlsGuard {
  if (!registeredGuard) {
    throw createCodedError(
      500,
      'No post-related-urls guard registered for entity relations; @services/posts must be imported for side effects before post/url relation writes occur',
      ENTITY_RELATION_POST_RELATED_URLS_GUARD_UNREGISTERED,
    )
  }
  return registeredGuard
}
