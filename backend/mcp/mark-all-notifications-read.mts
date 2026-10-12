import type { MergedToolSource } from './create-merged-tool.mts'
import { markAllNotificationsRead } from '@services/notifications'
import type { BasicUser } from '@services/users/types'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'

const tool: MergedToolSource<Record<string, never>, { success: true; marked_read: number }> = {
  schema: {
    description:
      "Mark all of the current user's unread notifications as read, and report how many changed. Notifications that are already read or deleted are left alone.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Mark All Notifications Read',
    plan: 'plus',
    requiredScopes: { mcp: ['notifications:read', 'notifications:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'POST', path: '/api/v1/my/notifications/read-all' }],
    outputSchema: successSchema({ marked_read: { type: 'integer', minimum: 0 } }),
  },
  function: (currentUser: BasicUser) => async () => {
    const user = await requireActiveToolUser(currentUser)
    return { success: true, marked_read: await markAllNotificationsRead(user.id) }
  },
}

export default tool
