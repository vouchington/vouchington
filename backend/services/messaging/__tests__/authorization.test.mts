import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestLocalFollow,
  insertTestBlock,
  setTestUserDirectMessagesAudience,
  softDeleteUser,
} from '@voucha/test-helpers'
import {
  currentUserCanMessageUser,
  currentUserCanViewConversation,
  currentUserCanSendMessage,
} from '../authorization.mts'
import { findOrCreateDirectConversation, createGroupConversation } from '../create.mts'

async function makeRecipientWithAudience(audience: string) {
  const user = await createTestUser()
  await setTestUserDirectMessagesAudience(user.id, audience)
  return { ...user, direct_messages_audience: audience }
}

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

describe('currentUserCanMessageUser', () => {
  it('allows messaging when audience is everyone', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('everyone')

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(true)
  })

  it('allows messaging when audience is users', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('users')

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(true)
  })

  it('allows messaging when audience is followers and sender follows recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('followers')
    await insertTestLocalFollow(sender.id, recipient.id)

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(true)
  })

  it('rejects messaging when audience is followers and sender does not follow recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('followers')

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(false)
  })

  it('allows messaging when audience is mutual_followers and follow is mutual', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('mutual_followers')
    await insertTestLocalFollow(sender.id, recipient.id)
    await insertTestLocalFollow(recipient.id, sender.id)

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(true)
  })

  it('rejects messaging when audience is mutual_followers and follow is one-sided', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('mutual_followers')
    await insertTestLocalFollow(sender.id, recipient.id)

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(false)
  })

  it('rejects messaging when audience is nobody', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('nobody')

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(false)
  })

  it('rejects messaging when sender is blocked by recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('everyone')
    await insertTestBlock(recipient.id, sender.id)

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(false)
  })

  it('rejects messaging when sender has blocked recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('everyone')
    await insertTestBlock(sender.id, recipient.id)

    expect(await currentUserCanMessageUser(sender.id, recipient.id, recipient)).toBe(false)
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
