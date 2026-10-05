import type { Tool } from '@services/openai-agents/tool-types'
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

const tool: Tool<Args, Result> = {
  schema: {
    name: 'list_my_review_disputes',
    type: 'function',
    description: `List the review disputes the current user filed, newest first. status is pending (default) for the ones the moderators have not decided, resolved for the decided ones, or dismissed for the ones the moderators dismissed. Each dispute has its id, the post_id and topic_id it disputes, the reason code, its status, is_overdue while pending, the resolution_action once decided, and the moderators' public_response, fenced as external content, once it was sent. Returns at most ${PAGE_LIMIT.max} disputes per page (default ${PAGE_LIMIT.default}) and page_info.end_cursor; pass it as after, with the same status, for the next page. A malformed cursor, or one from a different status, returns { success: false, error: "Invalid cursor" }. Other users' disputes are never listed.`,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...REVIEW_DISPUTE_STATUSES] },
        ...pageInputProperties('Disputes', PAGE_LIMIT),
      },
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'List My Review Disputes',
    requiredScopes: { mcp: ['disputes:read'] },
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
