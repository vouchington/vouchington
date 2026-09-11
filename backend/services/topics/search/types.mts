// Canonical definitions live in @voucha/types/entities/topic-search (avoids a
// services/topics <-> modules/search-utils workspace cycle: modules/search-utils
// needs these types but must not depend on @services/topics).
export type {
  TopicSearchSort,
  TopicSearchResult,
  TopicSearchOptions,
} from '@voucha/types/entities/topic-search'
