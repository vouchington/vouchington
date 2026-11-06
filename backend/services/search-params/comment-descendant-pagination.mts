import { createPaginationParser } from '@modules/pagination'
import { COMMENT_DESCENDANTS_LIMIT } from '@services/comments/descendant-page'
import { getPaginationLimitsForContract } from '@services/pagination'

/** REST and MCP use the same runtime limit bounds and cursor parameter guards. */
export const commentDescendantPaginationParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: COMMENT_DESCENDANTS_LIMIT,
})

export function parseCommentDescendantPagination(query: Record<string, unknown>) {
  return commentDescendantPaginationParser.parse(
    query,
    getPaginationLimitsForContract(commentDescendantPaginationParser.queryContract),
  )
}
