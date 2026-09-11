import { registerBookmarkBloomHandler } from '@services/entity-relations/bookmark-bloom-handler-registry'
import { addBookmarkBloomEntries } from './bloom-filter.mts'

// Registers this package's bloom-filter maintenance as entity-relations' bookmark bloom handler,
// as a side effect of importing this module (see backend/services/bookmarks/index.mts, which
// imports this first for its side effects). Keeps entity-relations from depending on bookmarks.
registerBookmarkBloomHandler(addBookmarkBloomEntries)
