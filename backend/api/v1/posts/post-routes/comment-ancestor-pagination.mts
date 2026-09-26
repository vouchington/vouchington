import {
  decodeCommentAncestorCursor,
  encodeCommentAncestorCursor,
  type CommentNode,
} from '@services/comments'
import {
  COMMENT_ANCESTOR_PAGE_MAX_LIMIT,
  getCommentAncestorPage,
  getCommentAncestorTargetByAny,
} from '@services/comments/ancestor-page'
import {
  defineQueryContract,
  parseBoundedIntegerLimit,
  queryInteger,
  queryString,
} from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

export const commentAncestorPaginationQuery = defineQueryContract({
  after: queryString({
    description: 'Opaque cursor that reveals the next rootward ancestor window.',
  }),
  limit: queryInteger({
    maximum: COMMENT_ANCESTOR_PAGE_MAX_LIMIT,
    minimum: 1,
  }),
})

export function prepareCommentAncestorPagination(query: Record<string, unknown>): {
  hasBoundedQuery: boolean
  validationQuery: Record<string, unknown>
  pageQuery: { after?: unknown; limit: number } | null
} {
  const hasBoundedQuery = query.after !== undefined || query.limit !== undefined
  if (!hasBoundedQuery) {
    return { hasBoundedQuery, validationQuery: {}, pageQuery: null }
  }

  const limit = parseBoundedIntegerLimit(query.limit, {
    default: COMMENT_ANCESTOR_PAGE_MAX_LIMIT,
    max: COMMENT_ANCESTOR_PAGE_MAX_LIMIT,
    min: 1,
  })
  const { after: rawAfter, ...queryWithoutAfter } = query
  const validationQuery = prepareQueryForValidation(
    typeof rawAfter === 'string' ? query : queryWithoutAfter,
    commentAncestorPaginationQuery.queryContract,
  )
  if (query.limit !== undefined) validationQuery.limit = limit
  // Scoped cursor decoding is the semantic owner for malformed cursor shapes. Do not turn a
  // repeated/non-string cursor into an adapter 422 before it can retain the route's 400 contract.

  return {
    hasBoundedQuery,
    validationQuery,
    pageQuery: { after: query.after, limit },
  }
}

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
