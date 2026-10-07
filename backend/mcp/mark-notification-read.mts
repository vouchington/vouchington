import { markNotificationRead } from '@services/notifications'
import type { BasicUser } from '@services/users/types'
import createHttpError from 'http-errors'
import {
  NOTIFICATION_ID_PARAMETERS,
  type NotificationToolArgs,
} from './notification-tool-support.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

const tool: Tool<NotificationToolArgs, { success: true }> = {
  schema: {
    name: 'mark_notification_read',
    type: 'function',
    description:
      "Mark one of the current user's notifications as read. Marking one that is already read changes nothing; a notification that is missing, deleted or another user's fails as not found.",
    parameters: NOTIFICATION_ID_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Mark Notification Read',
    plan: 'plus',
    requiredScopes: { mcp: ['notifications:read', 'notifications:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/my/notifications/:id' }],
    outputSchema: successSchema({}),
  },
  function: (currentUser: BasicUser) => async (args: NotificationToolArgs) => {
    const user = await requireActiveToolUser(currentUser)
    if (!(await markNotificationRead(user.id, args.notification_id)))
      throw createHttpError(404, 'Notification not found')
    return { success: true }
  },
}

export default tool
