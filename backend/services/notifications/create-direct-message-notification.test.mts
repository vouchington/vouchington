import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  createTestDirectConversation,
  getTestNotificationPushIntent,
} from '@voucha/test-helpers'
import { createDirectMessageNotifications } from './create-direct-message-notification.mts'

describe('create-direct-message-notification', () => {
  it('captures fresh and regenerated intent generations in a mixed recipient upsert', async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: user.id, user2Id: other.id })

    const first = await createDirectMessageNotifications([user.id], conversation.id)
    expect(first).toHaveLength(1)
    expect(first[0]!.user_id).toBe(user.id)
    const original = first[0]!.id
    await expect(getTestNotificationPushIntent(user.id, original)).resolves.toMatchObject({
      status: 'pending',
      conversation_id: conversation.id,
    })

    const second = await createDirectMessageNotifications(
      [user.id, other.id, user.id, other.id],
      conversation.id,
    )
    expect(second.map(row => row.user_id).toSorted()).toEqual([user.id, other.id].toSorted())
    expect(second.find(row => row.user_id === user.id)?.id).not.toBe(original)
    await expect(getTestNotificationPushIntent(user.id, original)).resolves.toBeUndefined()
    const intents = await Promise.all(
      second.map(row => getTestNotificationPushIntent(row.user_id, row.id)),
    )
    expect(intents).toEqual([
      expect.objectContaining({ status: 'pending', conversation_id: conversation.id }),
      expect.objectContaining({ status: 'pending', conversation_id: conversation.id }),
    ])
  })
})
