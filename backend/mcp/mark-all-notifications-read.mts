import type { MergedToolSource } from './create-merged-tool.mts'
import { markAllNotificationsRead } from '@services/notifications'
import type { BasicUser } from '@services/users/types'
import { successSchema } from '@vouchington/mcp-server/schema'
import { requireActiveToolUser } from './private-user.mts'

const tool: MergedToolSource<
  Record<string, never>,
  { success: true; marked_read: number; has_more: boolean }
> = {
  schema: {
    description:
      "Mark a page of unread notifications as read. marked_read is this call's count; has_more means continuation is queued. Repeat for an immediate next page.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  meta: {
    audience: 'user',
    title: 'Mark All Notifications Read',
    plan: 'plus',
    requiredScopes: ['notifications:read', 'notifications:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'POST', path: '/api/v1/my/notifications/read-all' }],
    outputSchema: successSchema({
      marked_read: { type: 'integer', minimum: 0 },
      has_more: { type: 'boolean' },
    }),
  },
  function: (currentUser: BasicUser) => async () => {
    const user = await requireActiveToolUser(currentUser)
    const { marked_read, has_more } = await markAllNotificationsRead(user.id)
    return { success: true, marked_read, has_more }
  },
}

export default tool
