import { getUnreadNotificationsSummary } from '@services/notifications'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import {
  notificationOutputProperties,
  toMcpNotificationBody,
  unreadCountSchema,
  type McpNotificationBody,
} from './mcp-notification-output.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'

type ToolResult = { success: true; unread_count: number } & McpNotificationBody

const tool: Tool<Record<string, never>, ToolResult> = {
  schema: {
    name: 'get_my_unread_notifications',
    type: 'function',
    description:
      "Get the current user's unread notifications: unread_count is how many there are in all, and the newest 10 come back in results (their ids, newest first), notifications (each one by id, with its entity_type, title, body, actor_label, target_entity, target_intent and the ids of what it is about) and communities (the communities they mention). Titles, actor labels and community names are sanitized and a body is fenced as external content, because they can quote other users; an empty body is an empty string. Use get_my_notifications to page through every notification, read or not. Reading never marks a notification read.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get My Unread Notifications',
    requiredScopes: { mcp: ['notifications:read'] },
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
