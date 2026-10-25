import type { MergedToolSource } from './create-merged-tool.mts'
import { getUnreadNotificationsSummary } from '@services/notifications'
import type { BasicUser } from '@services/users/types'
import {
  notificationOutputProperties,
  toMcpNotificationBody,
  unreadCountSchema,
  type McpNotificationBody,
} from './mcp-notification-output.mts'
import { successSchema } from '@vouchington/mcp-server/schema'
import { requirePrivateToolUser } from './private-user.mts'

type ToolResult = { success: true; unread_count: number } & McpNotificationBody

const tool: MergedToolSource<Record<string, never>, ToolResult> = {
  schema: {
    description:
      "Get the current user's unread count and newest 10 notifications. results gives ids; notifications and communities hold details by id. Text from others is sanitized or fenced as external content. Use read_my_notifications (option list) for all items. Reading never marks an item read.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  meta: {
    audience: 'user',
    title: 'Get My Unread Notifications',
    requiredScopes: ['notifications:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/notifications/unread' }],
    outputSchema: successSchema({
      unread_count: unreadCountSchema(),
      ...notificationOutputProperties(),
    }),
  },
  function: (currentUser: BasicUser) => async (): Promise<ToolResult> => {
    const user = await requirePrivateToolUser(currentUser)
    const summary = await getUnreadNotificationsSummary(user.id)
    return {
      success: true,
      unread_count: summary.unread_count,
      ...(await toMcpNotificationBody(summary)),
    }
  },
}

export default tool
