import { listNotifications } from '@services/notifications'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import {
  notificationOutputProperties,
  toMcpNotificationBody,
  type McpNotificationBody,
} from './mcp-notification-output.mts'
import { pageInfoSchema, pageInputProperties, type McpPageLimit } from './mcp-read-output.mts'
import {
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  type SearchPageInfo,
} from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = { limit?: number; after?: string }

type ToolResult =
  | ({ success: true; page_info: SearchPageInfo } & McpNotificationBody)
  | InvalidCursorResult

/** The page sizes of GET /api/v1/my/notifications. */
const PAGE_LIMIT: McpPageLimit = { min: 1, max: 100, default: 25 }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_my_notifications',
    type: 'function',
    description: `List the current user's own notifications, newest first, with whether each is read. results lists the notification ids in order; notifications holds each one by id (its entity_type, title, body, actor_label, target_path, read_at and the ids of what it is about) and communities holds the communities they mention. Titles, actor labels and community names are sanitized and a body is fenced as external content, because they can quote other users; an empty body is an empty string. Returns at most ${PAGE_LIMIT.max} notifications per page (default ${PAGE_LIMIT.default}) and page_info.end_cursor; pass it as after for the next page. A malformed cursor returns { success: false, error: "Invalid cursor" }. get_my_unread_notifications gives just the unread ones with their count. Reading never marks a notification read.`,
    parameters: {
      type: 'object',
      properties: pageInputProperties('Notifications', PAGE_LIMIT),
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get My Notifications',
    requiredScopes: { mcp: ['notifications:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/notifications' }],
    outputSchema: foundOrNotFoundSchema({
      ...notificationOutputProperties(),
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const page = await findPageOrNull(args.after, () =>
        listNotifications(currentUser.id, {
          after: args.after,
          limit: clampToolLimit(args.limit, PAGE_LIMIT.default, PAGE_LIMIT.max),
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        ...(await toMcpNotificationBody(page)),
        page_info: page.page_info,
      }
    },
}

export default tool
