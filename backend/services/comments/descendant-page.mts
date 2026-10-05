import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import type { PageInfo } from '@voucha/types/pagination'
import { getVisibleCommentDescendantIdsPage } from './descendant-ids.mts'

/** The page size contract of `GET /api/v1/posts/:idOrSlug/descendants` and its MCP twin. */
export const COMMENT_DESCENDANTS_LIMIT = { min: 1, max: 200, default: 100 } as const

export type CommentDescendantsPage = { ids: string[]; pageInfo: PageInfo }

/**
 * One cursor page of the comments a viewer can see below `post`, in id order. A comment the viewer
 * cannot see hides its whole subtree, so neither a hidden id nor a hidden count reaches the page.
 * Cursors are scoped to the thread and post, never to a viewer, and a cursor from another post
 * fails with the 400 "Invalid cursor format".
 */
export async function getCommentDescendantsPage(
  currentUser: PrivateUser | null,
  post: { id: string; root_post_id: string | null },
  options: { limit: number; after?: string },
): Promise<CommentDescendantsPage> {
  const rootId = post.root_post_id ?? post.id
  const scope = `comment-descendants:${rootId}:${post.id}`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await getVisibleCommentDescendantIdsPage(
    currentUser,
    rootId,
    post.id,
    { limit: options.limit, afterId },
  )
  const last = results.at(-1)
  return {
    ids: results,
    pageInfo: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage && last ? encodeScopedUuidCursor(last, scope) : null,
      start_cursor: results[0] ? encodeScopedUuidCursor(results[0], scope) : null,
    },
  }
}
