import { getEntityRelationTableNameOrThrow } from './entity-relations-metadata.mts'

/**
 * Shared table-name constants for the post/topic category relation and its hashtag-alias
 * counterpart. Every call site that needs either table name should import from here instead of
 * re-deriving it — see `backend/modules/feed-query-builders/topic-post-candidates.mts` for the
 * shared SQL shapes built on top of these tables.
 */
export const POST_TOPIC_CATEGORY_RELATION_TABLE = getEntityRelationTableNameOrThrow({
  subjectType: 'post',
  objectType: 'topic',
  predicate: 'category',
})

export const POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE = getEntityRelationTableNameOrThrow({
  subjectType: 'post',
  objectType: 'topic_alias',
  predicate: 'category',
})
