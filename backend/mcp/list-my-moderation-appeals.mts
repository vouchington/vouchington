import type { MergedToolSource } from './create-merged-tool.mts'
import { listModerationAppealPage } from '@services/moderation-appeals/list-page'
import { MODERATION_APPEAL_STATUSES } from '@ts-shared/utils/moderation-catalogs'
import { APPEAL_SCHEMA, toMcpAppeal, type McpAppeal } from './mcp-case-output.mts'
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

type Args = { status?: (typeof MODERATION_APPEAL_STATUSES)[number]; limit?: number; after?: string }

type Result =
  | { success: true; appeals: McpAppeal[]; page_info: SearchPageInfo }
  | InvalidCursorResult

/** The page sizes of GET /api/v1/appeals. */
const PAGE_LIMIT: McpPageLimit = { min: 1, max: 100, default: 25 }

const tool: MergedToolSource<Args, Result> = {
  schema: {
    description:
      "List the current user's moderation appeals, newest first. Filter by status: pending (default), resolved or dismissed. target_type and target_id identify the warning, ban, removed post or suspension; results include applicable community_id and post_removal_kind, overdue state, resolution_action and public_response. Other users' appeals never appear.",
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...MODERATION_APPEAL_STATUSES] },
        ...pageInputProperties('Appeals', PAGE_LIMIT),
      },
      additionalProperties: false,
    },
  },
  meta: {
    audience: 'user',
    title: 'List My Moderation Appeals',
    requiredScopes: ['appeals:read'],
    suspendedAccess: true,
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/appeals' }],
    outputSchema: foundOrNotFoundSchema({
      appeals: { type: 'array', items: APPEAL_SCHEMA },
      page_info: pageInfoSchema(),
    }),
  },
  function: currentUser => async args => {
    const user = await requirePrivateToolUser(currentUser)
    const page = await findPageOrNull(args.after, () =>
      listModerationAppealPage({
        appellantUserId: user.id,
        status: args.status,
        limit: clampToolLimit(args.limit, PAGE_LIMIT.default, PAGE_LIMIT.max),
        after: args.after,
      }),
    )
    if (!page) return INVALID_CURSOR_RESULT
    return {
      success: true,
      appeals: await Promise.all(page.appeals.map(toMcpAppeal)),
      page_info: page.page_info,
    }
  },
}

export default tool
