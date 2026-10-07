import { createFollowNotification, listNotifications } from '@services/notifications'
import { createTestUser, softDeleteUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'

type Body = Record<string, unknown>

const NOTIFICATIONS = ['notifications:read'] as const
const OWN_DATA_TOOLS = [
  'get_my_notifications',
  'get_my_unread_notifications',
  'get_my_bio',
  'get_my_profile_links',
  'get_my_email_preferences',
  'get_my_preferences',
] as const

async function callerWithNotification() {
  const [user, actor] = await Promise.all([createTestUser(), createTestUser()])
  const [notification] = await createFollowNotification(user.id, actor.id, actor.username)
  const caller: McpContractCaller = { ...user, membership_plan: null }
  return { user, actor, caller, notificationId: notification!.id }
}

describe('own-data read tools, guards — real DB', () => {
  it.each(OWN_DATA_TOOLS)(
    '%s refuses a caller whose account was deleted after its credential was issued',
    async name => {
      // The notification row outlives the account, so reading by id alone would still return it.
      const { caller } = await callerWithNotification()
      await softDeleteUser(caller.id)
      expect((await listNotifications(caller.id)).results).toHaveLength(1)

      await expectMcpToolFunctionThrows(
        caller,
        name,
        {},
        { status: 401, message: 'Tool current user not found' },
      )
    },
  )

  it('refuses a deleted account through the call path, without returning its notifications', async () => {
    const { caller } = await callerWithNotification()
    await softDeleteUser(caller.id)

    expect(await callRejectedMcpTool(caller, 'get_my_notifications', {}, NOTIFICATIONS)).toContain(
      'Tool current user not found',
    )
  })

  it('leaves out the frontend route REST adds to a notification and keeps the structured target', async () => {
    const { user, caller, notificationId } = await callerWithNotification()
    const request = createRequest()
    await request.authenticateAs(user)
    const route = (await request.get('/api/v1/my/notifications').expect(200)).body as {
      notifications: Record<string, Body>
    }
    const restRecord = route.notifications[notificationId]!

    expect(restRecord['target_path']).toEqual(expect.any(String))
    for (const name of ['get_my_notifications', 'get_my_unread_notifications']) {
      const tool = (await callStructuredMcpTool(caller, name, {}, NOTIFICATIONS)) as {
        notifications: Record<string, Body>
      }
      const record = tool.notifications[notificationId]!

      expect(record).not.toHaveProperty('target_path')
      for (const field of ['actor_user_id', 'target_entity', 'target_intent', 'entity_type']) {
        expect(record[field]).toEqual(restRecord[field])
      }
    }
  })

  it('refuses an empty cursor instead of returning the first page again', async () => {
    const { caller } = await callerWithNotification()

    expect(
      await callStructuredMcpTool(caller, 'get_my_notifications', {}, NOTIFICATIONS),
    ).toMatchObject({ success: true })
    expect(
      await callStructuredMcpTool(caller, 'get_my_notifications', { after: '' }, NOTIFICATIONS),
    ).toEqual({ success: false, error: 'Invalid cursor' })
  })
})
