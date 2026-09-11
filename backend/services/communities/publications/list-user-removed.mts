import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  decodeScopedPreciseTimestampCursor,
  decodeScopedTierPreciseUuidCursor,
  decodeCursor,
  encodeScopedPreciseTimestampCursor,
  encodeScopedTierPreciseUuidCursor,
  isScopedPreciseTimestampCursor,
  type ScopedPreciseTimestampCursor,
  type ScopedTierPreciseUuidCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import { buildUserRemovedPostsQuery } from './list-user-removed-query.mts'

export { buildUserRemovedPostsQuery } from './list-user-removed-query.mts'

export type UserRemovedCommunityPost = {
  post_id: string
  post_title: string | null
  post_declared_language: string | null
  post_lingua_rs_detected_language: string | null
  community_id: string
  community_slug: string | null
  unpublished_at: string
  removal_tier: 0
  post_removal_kind: 'community'
}

export type UserRemovedPlatformPost = {
  post_id: string
  post_title: string | null
  post_declared_language: string | null
  post_lingua_rs_detected_language: string | null
  community_id: string | null
  community_slug: string | null
  unpublished_at: string
  removal_tier: 1
  post_removal_kind: 'platform'
}

export type UserRemovedPost = UserRemovedCommunityPost | UserRemovedPlatformPost

type ListUserRemovedPostsOptions = QueryOptions & {
  limit?: number
  after?: string
  includePlatform?: boolean
}

const LEGACY_CURSOR_SCOPE = (userId: string) =>
  `user-removed-community-posts:${userId}:unpublished-desc-post-id-desc`
const EXPANDED_CURSOR_SCOPE = (userId: string) =>
  `user-removed-posts:${userId}:removed-desc-kind-desc-post-desc:v2`

type UserRemovedPostsTraversal = {
  includePlatform: boolean
  cursorScope: string
  cursor?: ScopedPreciseTimestampCursor | ScopedTierPreciseUuidCursor
}

export async function listUserRemovedPosts(
  userId: string,
  options?: ListUserRemovedPostsOptions,
): Promise<{ results: UserRemovedPost[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 25
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  const traversal = resolveUserRemovedPostsTraversal(
    userId,
    options?.includePlatform === true,
    options?.after,
  )
  const { cursor, cursorScope, includePlatform } = traversal

  const query = buildUserRemovedPostsQuery(userId, { limit, includePlatform, cursor })
  const { rows } = await read(query, options)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as UserRemovedPost[]
  const encodeResultCursor = (post: UserRemovedPost): string =>
    includePlatform
      ? encodeScopedTierPreciseUuidCursor(
          post.unpublished_at,
          post.removal_tier,
          post.post_id,
          cursorScope,
        )
      : encodeScopedPreciseTimestampCursor(post.unpublished_at, post.post_id, cursorScope)

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage && results.length > 0 ? encodeResultCursor(results.at(-1)!) : null,
      start_cursor: results.length > 0 ? encodeResultCursor(results[0]!) : null,
    },
  }
}

function resolveUserRemovedPostsTraversal(
  userId: string,
  includePlatform: boolean,
  after?: string,
): UserRemovedPostsTraversal {
  const legacyScope = LEGACY_CURSOR_SCOPE(userId)
  if (!after) {
    return {
      includePlatform,
      cursorScope: includePlatform ? EXPANDED_CURSOR_SCOPE(userId) : legacyScope,
    }
  }
  if (!includePlatform) {
    return {
      includePlatform: false,
      cursorScope: legacyScope,
      cursor: decodeScopedPreciseTimestampCursor(after, legacyScope, 'Invalid cursor format'),
    }
  }

  const expandedScope = EXPANDED_CURSOR_SCOPE(userId)
  if (isScopedPreciseTimestampCursor(decodeCursor(after))) {
    return {
      includePlatform: false,
      cursorScope: legacyScope,
      cursor: decodeScopedPreciseTimestampCursor(after, legacyScope, 'Invalid cursor format'),
    }
  }
  return {
    includePlatform: true,
    cursorScope: expandedScope,
    cursor: decodeScopedTierPreciseUuidCursor(after, expandedScope, 'Invalid cursor format'),
  }
}
