import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  createTestDirectConversation,
  getTestNotificationPushIntent,
} from '@voucha/test-helpers'
import { createDirectMessageNotifications } from './create-direct-message-notification.mts'

describe('create-direct-message-notification', () => {
  it('upserts on conflict (returns updated notification on re-notification)', async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: user.id, user2Id: other.id })

    const first = await createDirectMessageNotifications([user.id], conversation.id)
    expect(first).toHaveLength(1)
    expect(first[0]!.user_id).toBe(user.id)
    expect(first[0]!.id).toBeTruthy()

    const second = await createDirectMessageNotifications([user.id], conversation.id)
    expect(second).toHaveLength(1)
    // The notification id is regenerated on upsert
    expect(second[0]!.user_id).toBe(user.id)
    expect(second[0]!.id).not.toBe(first[0]!.id)
    expect(await getTestNotificationPushIntent(user.id, first[0]!.id)).toBeUndefined()
    expect(await getTestNotificationPushIntent(user.id, second[0]!.id)).toMatchObject({
      status: 'pending',
      conversation_id: conversation.id,
    })
  })
})
