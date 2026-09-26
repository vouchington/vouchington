import {
  decodeCommentAncestorCursor,
  encodeCommentAncestorCursor,
  type CommentNode,
} from '@services/comments'
import {
  getCommentAncestorPage,
  getCommentAncestorTargetByAny,
} from '@services/comments/ancestor-page'

interface ResolvedCommentAncestorPage {
  ancestors: CommentNode[]
  targetId: string
  pageInfo: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export async function resolveCommentAncestorPage({
  after,
  idOrSlug,
  limit,
}: {
  after?: unknown
  idOrSlug: string
  limit: number
}): Promise<ResolvedCommentAncestorPage | null> {
  const target = await getCommentAncestorTargetByAny(idOrSlug)
  if (!target) return null
  const rootId = target.root_id ?? target.id
  const cursor =
    after === undefined
      ? undefined
      : decodeCommentAncestorCursor(String(after), {
          root_id: rootId,
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
              root_id: page.rootId,
              target_id: page.targetId,
            }),
      end_cursor:
        page.hasNextPage && page.nextId && page.startId
          ? encodeCommentAncestorCursor({
              id: page.ancestors[1]?.id ?? page.startId,
              next_id: page.nextId,
              role: 'end',
              root_id: page.rootId,
              target_id: page.targetId,
            })
          : null,
    },
  }
}
