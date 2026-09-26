import {
  defineQueryContract,
  parseBoundedIntegerLimit,
  queryInteger,
  queryString,
} from '@modules/pagination'
import { COMMENT_ANCESTOR_PAGE_MAX_LIMIT } from '@services/comments/ancestor-page'
import { prepareQueryForValidation } from './prepare-query.mts'

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

  return {
    hasBoundedQuery,
    validationQuery,
    pageQuery: { after: query.after, limit },
  }
}
