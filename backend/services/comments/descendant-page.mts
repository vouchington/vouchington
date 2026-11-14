import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import type { PageInfo } from '@voucha/types/pagination'
import { getVisibleCommentDescendantIdsPage } from './descendant-ids.mts'
import { createSearchCache } from '@services/entity-cache/search-cache'

/** The page size contract of `GET /api/v1/posts/:idOrSlug/descendants` and its MCP twin. */
export const COMMENT_DESCENDANTS_LIMIT = { min: 1, max: 200, default: 100 } as const

export type CommentDescendantsPage = { ids: string[]; pageInfo: PageInfo }

/**
 * One cursor page of direct-child heads below `post`, each with a bounded child preview. A deleted or
 * unmoderated comment is returned as a content-free placeholder when a valid reply sits below it
 * or the bounded look-down cannot rule one out. Opening any comment starts a new window. Cursors
 * resume after an inspected head and are scoped to this version, thread, and post, never to a viewer.
 */
export async function getCommentDescendantsPage(
  currentUser: PrivateUser | null,
  post: { id: string; root_post_id: string | null },
  options: { limit: number; after?: string },
): Promise<CommentDescendantsPage> {
  const rootId = post.root_post_id ?? post.id
  const scope = `comment-descendants-v2:${rootId}:${post.id}`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage, firstInspectedHeadId, lastInspectedHeadId } =
    await getVisibleCommentDescendantIdsPage(currentUser, rootId, post.id, {
      limit: options.limit,
      afterId,
    })
  return {
    ids: results,
    pageInfo: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && lastInspectedHeadId
          ? encodeScopedUuidCursor(lastInspectedHeadId, scope)
          : null,
      start_cursor: firstInspectedHeadId
        ? encodeScopedUuidCursor(firstInspectedHeadId, scope)
        : null,
    },
  }
}

const cachedAnonymousPage = createSearchCache(
  'comment_descendants_anon_v1',
  (input: { post: { id: string; root_post_id: string | null }; limit: number; after?: string }) =>
    getCommentDescendantsPage(null, input.post, { limit: input.limit, after: input.after }),
)

/** The page's canonical root and child SQL runs on cache fill, including cursor pages. */
export function getAnonymousCommentDescendantsPageCached(
  post: { id: string; root_post_id: string | null },
  options: { limit: number; after?: string },
): Promise<CommentDescendantsPage> {
  return cachedAnonymousPage({
    post: { id: post.id, root_post_id: post.root_post_id },
    limit: options.limit,
    after: options.after,
  })
}
