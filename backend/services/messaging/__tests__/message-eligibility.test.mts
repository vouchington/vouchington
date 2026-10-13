import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestLocalFollow,
  insertTestBlock,
  insertTestMute,
  setTestUserDirectMessagesAudience,
} from '@voucha/test-helpers'
import { currentUserCanMessageUsers } from '../message-eligibility.mts'

async function makeRecipientWithAudience(audience: string) {
  const user = await createTestUser()
  await setTestUserDirectMessagesAudience(user.id, audience)
  return { ...user, direct_messages_audience: audience }
}

describe('currentUserCanMessageUsers', () => {
  it('allows messaging when audience is everyone', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('everyone')

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(true)
  })

  it('allows messaging when audience is users', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('users')

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(true)
  })

  it('allows messaging when audience is followers and sender follows recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('followers')
    await insertTestLocalFollow(sender.id, recipient.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(true)
  })

  it('rejects messaging when audience is followers and sender does not follow recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('followers')

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('allows messaging when audience is mutual_followers and follow is mutual', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('mutual_followers')
    await insertTestLocalFollow(sender.id, recipient.id)
    await insertTestLocalFollow(recipient.id, sender.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(true)
  })

  it('rejects messaging when audience is mutual_followers and follow is one-sided', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('mutual_followers')
    await insertTestLocalFollow(sender.id, recipient.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('rejects messaging when audience is nobody', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('nobody')

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('rejects messaging when sender is blocked by recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('everyone')
    await insertTestBlock(recipient.id, sender.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('rejects messaging when sender has blocked recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('everyone')
    await insertTestBlock(sender.id, recipient.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('rejects messaging when sender has muted recipient', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('everyone')
    await insertTestMute(sender.id, recipient.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('rejects messaging when recipient has muted sender', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('everyone')
    await insertTestMute(recipient.id, sender.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('rejects a blocked recipient even when the audience is followers and the follow is mutual', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('mutual_followers')
    await insertTestLocalFollow(sender.id, recipient.id)
    await insertTestLocalFollow(recipient.id, sender.id)
    await insertTestBlock(recipient.id, sender.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('rejects an unknown audience value', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    expect(
      await currentUserCanMessageUsers(sender.id, [
        { id: recipient.id, direct_messages_audience: 'unexpected' },
      ]),
    ).toBe(false)
  })

  it('rejects a mutual_followers recipient who follows only in the reverse direction', async () => {
    const sender = await createTestUser()
    const recipient = await makeRecipientWithAudience('mutual_followers')
    await insertTestLocalFollow(recipient.id, sender.id)

    expect(await currentUserCanMessageUsers(sender.id, [recipient])).toBe(false)
  })

  it('allows a batch only when every recipient allows the sender', async () => {
    const sender = await createTestUser()
    const open = await makeRecipientWithAudience('everyone')
    const followersOnly = await makeRecipientWithAudience('followers')

    expect(await currentUserCanMessageUsers(sender.id, [open, followersOnly])).toBe(false)

    await insertTestLocalFollow(sender.id, followersOnly.id)
    expect(await currentUserCanMessageUsers(sender.id, [open, followersOnly])).toBe(true)
  })

  it('rejects the batch when only one of several recipients has blocked the sender', async () => {
    const sender = await createTestUser()
    const open = await makeRecipientWithAudience('everyone')
    const blocker = await makeRecipientWithAudience('everyone')
    await insertTestBlock(blocker.id, sender.id)

    expect(await currentUserCanMessageUsers(sender.id, [open, blocker])).toBe(false)
  })

  it('allows an empty recipient list', async () => {
    const sender = await createTestUser()

    expect(await currentUserCanMessageUsers(sender.id, [])).toBe(true)
  })
})
