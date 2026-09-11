// Canonical definitions live in @voucha/types/entities/post-search (avoids a
// services/posts <-> modules/search-utils workspace cycle: modules/search-utils
// needs these types but must not depend on @services/posts).
export type {
  PostSearchSort,
  PostSearchResult,
  PostSearchOptions,
} from '@voucha/types/entities/post-search'
