import { describe, it, expect } from 'vitest'
import { createTestUser, insertTestBlock } from '@voucha/test-helpers'
import {
  createTestGroupConversation,
  removeTestConversationParticipant,
  getTestConversationParticipants,
} from '@voucha/test-helpers/entities/conversations'
import {
  addConversationParticipant,
  removeConversationParticipant,
  updateConversationParticipantAddPolicy,
  getConversationParticipants,
  currentUserCanManageParticipants,
  currentUserCanChangeParticipantPolicy,
} from './index.mts'

describe('addConversationParticipant', () => {
  it('allows owner to add a new member', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const newUser = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    const participant = await addConversationParticipant(owner.id, conversationId, newUser.id)

    expect(participant.user_id).toBe(newUser.id)
    expect(participant.role).toBe('member')
    expect(typeof participant.username).toBe('string')
  })

  it('allows any active member to add when policy is all_members', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const newUser = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })
    await updateConversationParticipantAddPolicy(owner.id, conversationId, 'all_members')

    const participant = await addConversationParticipant(member.id, conversationId, newUser.id)
    expect(participant.user_id).toBe(newUser.id)
  })

  it('blocks non-owner when policy is owner_only', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const newUser = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await expect(
      addConversationParticipant(member.id, conversationId, newUser.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws 409 when user is already an active participant', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await expect(
      addConversationParticipant(owner.id, conversationId, member.id),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('throws 403 when new user has a block/mute with an existing participant', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const blocked = await createTestUser()
    await insertTestBlock(member.id, blocked.id)
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await expect(
      addConversationParticipant(owner.id, conversationId, blocked.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('added participant appears in getConversationParticipants with username and profile_image_id', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const newUser = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await addConversationParticipant(owner.id, conversationId, newUser.id)

    const participants = await getConversationParticipants(conversationId)
    const added = participants.find(p => p.user_id === newUser.id)
    expect(added).toBeDefined()
    expect(added?.username).toBe(newUser.username)
    expect('profile_image_id' in (added ?? {})).toBe(true)
  })

  it('allows re-add after removal', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await removeTestConversationParticipant(conversationId, member.id)
    const participant = await addConversationParticipant(owner.id, conversationId, member.id)
    expect(participant.user_id).toBe(member.id)
  })
})

describe('removeConversationParticipant', () => {
  it('owner can remove another member', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await removeConversationParticipant(owner.id, conversationId, member.id)

    const active = await getTestConversationParticipants(conversationId)
    expect(active.find(p => p.user_id === member.id)).toBeUndefined()
  })

  it('non-owner can remove themselves (leave)', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await removeConversationParticipant(member.id, conversationId, member.id)

    const active = await getTestConversationParticipants(conversationId)
    expect(active.find(p => p.user_id === member.id)).toBeUndefined()
  })

  it('owner cannot leave (self-remove)', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await expect(
      removeConversationParticipant(owner.id, conversationId, owner.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('non-owner cannot remove another participant', async () => {
    const owner = await createTestUser()
    const member1 = await createTestUser()
    const member2 = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member1.id, member2.id],
    })

    await expect(
      removeConversationParticipant(member1.id, conversationId, member2.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws 404 when removing a participant who is not active', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })
    await removeTestConversationParticipant(conversationId, member.id)

    await expect(
      removeConversationParticipant(owner.id, conversationId, member.id),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('updateConversationParticipantAddPolicy', () => {
  it('owner can change policy to all_members', async () => {
    const owner = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })

    await expect(
      updateConversationParticipantAddPolicy(owner.id, conversationId, 'all_members'),
    ).resolves.toBeUndefined()
  })

  it('non-owner cannot change policy', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    await expect(
      updateConversationParticipantAddPolicy(member.id, conversationId, 'all_members'),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('currentUserCanManageParticipants', () => {
  it('returns true for the owner (owner_only policy)', async () => {
    const owner = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })

    expect(await currentUserCanManageParticipants(owner.id, conversationId)).toBe(true)
  })

  it('returns true for active member when policy is all_members', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })
    await updateConversationParticipantAddPolicy(owner.id, conversationId, 'all_members')

    expect(await currentUserCanManageParticipants(member.id, conversationId)).toBe(true)
  })

  it('returns false for removed member even when policy is all_members', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })
    await updateConversationParticipantAddPolicy(owner.id, conversationId, 'all_members')
    await removeTestConversationParticipant(conversationId, member.id)

    expect(await currentUserCanManageParticipants(member.id, conversationId)).toBe(false)
  })

  it('returns false for non-participant', async () => {
    const owner = await createTestUser()
    const outsider = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })

    expect(await currentUserCanManageParticipants(outsider.id, conversationId)).toBe(false)
  })
})

describe('currentUserCanChangeParticipantPolicy', () => {
  it('returns true for the owner', async () => {
    const owner = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })

    expect(await currentUserCanChangeParticipantPolicy(owner.id, conversationId)).toBe(true)
  })

  it('returns false for a member', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    expect(await currentUserCanChangeParticipantPolicy(member.id, conversationId)).toBe(false)
  })
})
