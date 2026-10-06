import { listModerationAppealPage } from '@services/moderation-appeals/list-page'
import type { Tool } from '@services/openai-agents/tool-types'
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

const tool: Tool<Args, Result> = {
  schema: {
    name: 'list_my_moderation_appeals',
    type: 'function',
    description: `List the moderation appeals the current user filed, newest first. status is pending (default) for the ones the moderators have not decided, resolved for the accepted or reduced ones, or dismissed for the denied ones. Each appeal has its id, target_type and target_id (the warning, community ban, removed post or suspension it contests), the community_id and post_removal_kind where they apply, its status, is_overdue while pending, the resolution_action once decided, and the moderators' public_response, fenced as external content, once it was sent. Returns at most ${PAGE_LIMIT.max} appeals per page (default ${PAGE_LIMIT.default}) and page_info.end_cursor; pass it as after, with the same status, for the next page. A malformed cursor, or one from a different status, returns { success: false, error: "Invalid cursor" }. Other users' appeals are never listed.`,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...MODERATION_APPEAL_STATUSES] },
        ...pageInputProperties('Appeals', PAGE_LIMIT),
      },
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'List My Moderation Appeals',
    requiredScopes: { mcp: ['appeals:read'] },
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
