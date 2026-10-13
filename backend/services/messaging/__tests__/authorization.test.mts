import { describe, it, expect } from 'vitest'
import { createTestUser, insertTestBlock, softDeleteUser } from '@voucha/test-helpers'
import { currentUserCanViewConversation, currentUserCanSendMessage } from '../authorization.mts'
import { findOrCreateDirectConversation, createGroupConversation } from '../create.mts'

describe('currentUserCanViewConversation', () => {
  it('returns true when user is active participant', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)

    expect(await currentUserCanViewConversation(sender.id, conversation.id)).toBe(true)
    expect(await currentUserCanViewConversation(recipient.id, conversation.id)).toBe(true)
  })

  it('returns false when user is not a participant', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const stranger = await createTestUser()

    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)

    expect(await currentUserCanViewConversation(stranger.id, conversation.id)).toBe(false)
  })
})

describe('currentUserCanSendMessage', () => {
  it('returns false when user is not a participant', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()
    const stranger = await createTestUser()

    const conversation = await findOrCreateDirectConversation(user1.id, user2.id)

    expect(await currentUserCanSendMessage(stranger.id, conversation.id)).toBe(false)
  })

  it('returns true when sender has no block/mute with other participants', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)

    expect(await currentUserCanSendMessage(sender.id, conversation.id)).toBe(true)
  })

  it('returns false when sender is blocked by a recipient', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    await insertTestBlock(recipient.id, sender.id)

    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)

    expect(await currentUserCanSendMessage(sender.id, conversation.id)).toBe(false)
  })

  it('returns false in a group conv when a non-sender pair has a block/mute relationship', async () => {
    const sender = await createTestUser()
    const recipient1 = await createTestUser()
    const recipient2 = await createTestUser()

    const conversation = await createGroupConversation(sender.id, [recipient1.id, recipient2.id])

    // Before block: sender can send
    expect(await currentUserCanSendMessage(sender.id, conversation.id)).toBe(true)

    // After recipient1 blocks recipient2: sender is blocked from sending
    await insertTestBlock(recipient1.id, recipient2.id)
    expect(await currentUserCanSendMessage(sender.id, conversation.id)).toBe(false)
  })

  it('returns false when the other participant has soft-deleted their account', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)

    await softDeleteUser(recipient.id)

    // No active recipients remain — block the send for consistency with the create-DM gate
    expect(await currentUserCanSendMessage(sender.id, conversation.id)).toBe(false)
  })
})
