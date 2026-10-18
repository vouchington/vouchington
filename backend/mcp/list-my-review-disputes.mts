import type { MergedToolSource } from './create-merged-tool.mts'
import { listReviewDisputePage } from '@services/review-disputes/list-page'
import { REVIEW_DISPUTE_STATUSES } from '@ts-shared/utils/moderation-catalogs'
import { DISPUTE_SCHEMA, toMcpDispute, type McpDispute } from './mcp-case-output.mts'
import { pageInfoSchema, pageInputProperties, type McpPageLimit } from './mcp-read-output.mts'
import {
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  type SearchPageInfo,
} from './paged-search.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type Args = { status?: (typeof REVIEW_DISPUTE_STATUSES)[number]; limit?: number; after?: string }

type Result =
  | { success: true; disputes: McpDispute[]; page_info: SearchPageInfo }
  | InvalidCursorResult

/** The page sizes of GET /api/v1/disputes. */
const PAGE_LIMIT: McpPageLimit = { min: 1, max: 100, default: 25 }

const tool: MergedToolSource<Args, Result> = {
  schema: {
    description:
      "List the current user's review disputes, newest first. Filter by status: pending (default), resolved or dismissed. Results include disputed post_id and topic_id, reason, status, overdue state, resolution_action and any public_response. Other users' disputes never appear.",
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...REVIEW_DISPUTE_STATUSES] },
        ...pageInputProperties('Disputes', PAGE_LIMIT),
      },
      additionalProperties: false,
    },
  },
  meta: {
    audience: 'user',
    title: 'List My Review Disputes',
    requiredScopes: ['disputes:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/disputes' }],
    outputSchema: foundOrNotFoundSchema({
      disputes: { type: 'array', items: DISPUTE_SCHEMA },
      page_info: pageInfoSchema(),
    }),
  },
  function: currentUser => async args => {
    const user = await requirePrivateToolUser(currentUser)
    const page = await findPageOrNull(args.after, () =>
      listReviewDisputePage({
        audience: 'member',
        disputantUserId: user.id,
        status: args.status,
        limit: clampToolLimit(args.limit, PAGE_LIMIT.default, PAGE_LIMIT.max),
        after: args.after,
      }),
    )
    if (!page) return INVALID_CURSOR_RESULT
    return {
      success: true,
      disputes: await Promise.all(page.disputes.map(toMcpDispute)),
      page_info: page.page_info,
    }
  },
}

export default tool
