import { executePostSearchQuery } from './execute-query.mts'
import { getPostsWorkLimit } from '@services/posts/work-limits'
import { clampLimit } from '@services/pagination'
import type { BasicUser } from '@services/users/types'
import type { PostSearchOptions } from './types.mts'
import {
  hasSemanticSearch as hasSemanticSearchFn,
  hasTextSearch as hasTextSearchFn,
} from '@modules/search-utils'
import { assembleStorySourcePage, type RawStoryRow } from './story-source-assemble.mts'
import { decodeStoryCursor } from './story-source-cursor.mts'
import { buildStorySourcePageQuery } from './story-source-query.mts'
import type { StoryPage } from './story-source-types.mts'

export function isStorySourceSearch(options: PostSearchOptions): boolean {
  return options.post_types?.length === 1 && options.post_types[0] === 'story' && !options.story_id
}

/**
 * Story search reads a keyset page of feeds, then a bounded item slice from
 * each feed. Public readers walk live discoverable feeds. Moderation staff
 * also walk disabled and non-discoverable feeds. Sort modes do not rank the
 * whole corpus; they only thin this inspected window. A short page keeps a cursor.
 */
export async function searchStorySourcePosts(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
): Promise<StoryPage> {
  const limit = clampLimit(options.limit)
  const cursor = decodeStoryCursor(options.after)
  const hasTextSearch = hasTextSearchFn(options)
  const hasSemanticSearch =
    hasSemanticSearchFn(options) && options.semanticSearchEmbedding !== undefined
  const pageSize = getPostsWorkLimit('story_source_page_size')
  const childLimit = getPostsWorkLimit('story_source_child_limit')
  const query = buildStorySourcePageQuery({
    currentUser,
    options,
    cursor,
    hasSemanticSearch,
    hasTextSearch,
    pageSize,
    childLimit,
  })
  const { rows } = await executePostSearchQuery(query, hasSemanticSearch)
  return assembleStorySourcePage(rows as RawStoryRow[], { limit, childLimit })
}
