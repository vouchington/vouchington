import type { MergedToolSource } from './create-merged-tool.mts'
import { listNotifications } from '@services/notifications'
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
import { requirePrivateToolUser } from './private-user.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = { limit?: number; after?: string }

type ToolResult =
  | ({ success: true; page_info: SearchPageInfo } & McpNotificationBody)
  | InvalidCursorResult

/** The page sizes of GET /api/v1/my/notifications. */
const PAGE_LIMIT: McpPageLimit = { min: 1, max: 100, default: 25 }

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "List the current user's notifications and read state, newest first. results gives ids; notifications and communities hold details by id. Text from others is sanitized or fenced as external content. Use read_my_notifications (option unread) for unread count. Reading never marks an item read.",
    parameters: {
      type: 'object',
      properties: pageInputProperties('Notifications', PAGE_LIMIT),
      additionalProperties: false,
    },
  },
  meta: {
    audience: 'user',
    title: 'Get My Notifications',
    requiredScopes: ['notifications:read'],
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
      const user = await requirePrivateToolUser(currentUser)
      const page = await findPageOrNull(args.after, () =>
        listNotifications(user.id, {
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
