import { it, expect, describe } from 'vitest'
import { createTestUser, createTestDirectConversation } from '@voucha/test-helpers'
import { createDirectMessageNotification } from './create-direct-message-notification.mts'

describe('create-direct-message-notification', () => {
  it('creates a direct_message notification', async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: user.id, user2Id: other.id })

    const result = await createDirectMessageNotification(user.id, conversation.id)

    expect(result).toHaveLength(1)
    expect(result[0]!.user_id).toBe(user.id)
    expect(result[0]!.id).toBeTruthy()
  })

  it('upserts on conflict (returns updated notification on re-notification)', async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: user.id, user2Id: other.id })

    const first = await createDirectMessageNotification(user.id, conversation.id)
    expect(first).toHaveLength(1)

    const second = await createDirectMessageNotification(user.id, conversation.id)
    expect(second).toHaveLength(1)
    // The notification id is regenerated on upsert
    expect(second[0]!.user_id).toBe(user.id)
  })
})
