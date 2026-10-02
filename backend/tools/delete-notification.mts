import { enqueueDeleteNotification } from '@queues/notifications/enqueues'
import { hasNotification } from '@services/notifications'
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
    name: 'delete_notification',
    type: 'function',
    description:
      "Delete one of the current user's notifications. The deletion is queued and completes shortly after the call returns. A notification that is missing, already deleted or another user's fails as not found.",
    parameters: NOTIFICATION_ID_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Delete Notification',
    plan: 'plus',
    requiredScopes: { mcp: ['notifications:read', 'notifications:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/my/notifications/:id' }],
    outputSchema: successSchema({}),
  },
  function: (currentUser: BasicUser) => async (args: NotificationToolArgs) => {
    const user = await requireActiveToolUser(currentUser)
    if (!(await hasNotification(user.id, args.notification_id)))
      throw createHttpError(404, 'Notification not found')
    await enqueueDeleteNotification(user.id, args.notification_id)
    return { success: true }
  },
}

export default tool
