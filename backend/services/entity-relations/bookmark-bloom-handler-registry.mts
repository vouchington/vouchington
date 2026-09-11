import { createCodedError } from '@modules/on-error/create-coded-error'
import { ENTITY_RELATION_BOOKMARK_BLOOM_HANDLER_UNREGISTERED } from '@modules/on-error/error-codes'

export type BookmarkBloomHandler = (
  userId: string,
  relationTableName: string,
  objectIds: string[],
) => Promise<void>

let registeredHandler: BookmarkBloomHandler | null = null

// @services/bookmarks registers its handler here as a side effect of module load
// (see backend/services/bookmarks/register-bookmark-bloom-handler.mts)
// so entity-relations never imports bookmarks directly.
export function registerBookmarkBloomHandler(handler: BookmarkBloomHandler): void {
  registeredHandler = handler
}

// Internal to entity-relations: only bookmark-bloom-maintenance.mts should call this. Throws
// instead of letting a bookmark relation write silently skip its bloom-filter update when the
// registration above never ran (e.g. a missing side-effect import at process boot).
export function getRegisteredBookmarkBloomHandler(): BookmarkBloomHandler {
  if (!registeredHandler) {
    throw createCodedError(
      500,
      'No bookmark bloom handler registered for entity relations; @services/bookmarks must be imported for side effects before bookmark relation writes occur',
      ENTITY_RELATION_BOOKMARK_BLOOM_HANDLER_UNREGISTERED,
    )
  }
  return registeredHandler
}
