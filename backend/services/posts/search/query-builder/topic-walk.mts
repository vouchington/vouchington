import { hasSemanticSearch, hasTextSearch } from '@modules/search-utils'
import { getPostsWorkLimit } from '../../work-limits.mts'
import type { PostSearchOptions, PostSearchSort } from '../types.mts'
import { hasTopicMembershipFilters } from './topic-filters.mts'

/** Posts a topic-filtered page inspects before it returns what matched and a continuation cursor. */
export function getTopicWalkRowCap(): number {
  return getPostsWorkLimit('topic_walk_row_cap')
}

/** A capped walk reads the sort key page by page; counts and phased walks stay uncapped. */
export function usesCappedTopicWalk(options: PostSearchOptions, sort: PostSearchSort): boolean {
  return (
    hasTopicMembershipFilters(options) &&
    options.omitLimit !== true &&
    options.omitOrderBy !== true &&
    !hasTextSearch(options) &&
    !hasSemanticSearch(options) &&
    !options.similar_post_id &&
    !options.similar_topic_id &&
    !options.similar_rss_feed_item_id &&
    options.following_phase === undefined &&
    sort !== 'following_new'
  )
}
