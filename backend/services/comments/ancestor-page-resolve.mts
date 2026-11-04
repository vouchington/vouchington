import { decodeCommentAncestorCursor, encodeCommentAncestorCursor } from './ancestor-cursor.mts'
import { getCommentAncestorPage, type CommentAncestorTarget } from './ancestor-page.mts'
import type { CommentNode } from './types.mts'

interface ResolvedCommentAncestorPage {
  ancestors: CommentNode[]
  targetId: string
  pageInfo: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

/** The root plus one bounded window of the target's ancestors, with a signed cursor to continue. */
export async function resolveCommentAncestorPage({
  after,
  limit,
  target,
}: {
  after?: string
  limit: number
  target: CommentAncestorTarget
}): Promise<ResolvedCommentAncestorPage> {
  const rootId = target.root_post_id ?? target.id
  const cursor =
    after === undefined
      ? undefined
      : decodeCommentAncestorCursor(after, {
          root_post_id: rootId,
          target_id: target.id,
        })
  const page = await getCommentAncestorPage({
    limit,
    startId: cursor?.next_id,
    target,
  })

  return {
    ancestors: page.ancestors,
    targetId: target.id,
    pageInfo: {
      has_next_page: page.hasNextPage,
      start_cursor:
        page.startId === null || page.startNextId === null
          ? null
          : encodeCommentAncestorCursor({
              id: page.startId,
              next_id: page.startNextId,
              role: 'start',
              root_post_id: page.rootId,
              target_id: page.targetId,
            }),
      end_cursor:
        page.hasNextPage && page.nextId && page.startId
          ? encodeCommentAncestorCursor({
              id: page.ancestors[1]?.id ?? page.startId,
              next_id: page.nextId,
              role: 'end',
              root_post_id: page.rootId,
              target_id: page.targetId,
            })
          : null,
    },
  }
}
