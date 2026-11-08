import { describe, it, expect, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityVacation,
  getTestConversationParticipants,
  getTestConversationThreadFields,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { openModmailThread, assignModmailThread, resolveModmailThread } from '../threads.mts'
import { getCommunityModmailInbox, getMyModmailThreads } from '../threads-get.mts'
import { loadModmailReplyAccess, replyToModmailThread } from '../member-actions.mts'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { conversationParticipantLimitsConfig } from '@services/messaging/participant-limits'

async function createTestCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

async function addModToCommunity(communityId: string, modId: string) {
  await insertTestCommunityMember({ communityId, userId: modId, role: 'moderator' })
}

describe('openModmailThread', () => {
  it('creates a modmail conversation with subject user as member', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)

    const thread = await openModmailThread(subject.id, community.id, subject.id)

    expect(thread.channel_type).toBe('modmail')
    expect(thread.community_id).toBe(community.id)
    expect(thread.subject_user_id).toBe(subject.id)
  })

  it('opens with the subject only, leaving other live staff outside the participant roster', async () => {
    const owner = await createTestUser()
    const mod1 = await createTestUser()
    const mod2 = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, mod1.id)
    await addModToCommunity(community.id, mod2.id)

    const thread = await openModmailThread(subject.id, community.id, subject.id)

    const participants = await getTestConversationParticipants(thread.id)

    expect(participants).toEqual([expect.objectContaining({ user_id: subject.id, role: 'member' })])
  })

  it('adds non-subject caller as admin participant on new thread', async () => {
    const owner = await createTestUser()
    const staff = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)

    const thread = await openModmailThread(staff.id, community.id, subject.id)

    const participants = await getTestConversationParticipants(thread.id)
    const staffParticipant = participants.find(p => p.user_id === staff.id)
    expect(staffParticipant?.role).toBe('admin')
  })

  it('does not admit another staff member just for opening an existing thread', async () => {
    const owner = await createTestUser()
    const staff = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)

    // Create the thread as the subject first
    const thread = await openModmailThread(subject.id, community.id, subject.id)

    // Live staff can inspect this thread without spending a participant slot.
    const sameThread = await openModmailThread(staff.id, community.id, subject.id)
    expect(sameThread.id).toBe(thread.id)

    const participants = await getTestConversationParticipants(thread.id)
    expect(participants).toEqual([expect.objectContaining({ user_id: subject.id, role: 'member' })])
  })
})

describe('modmail staff first reply', () => {
  it('allows a moderator on vacation to join through a successful reply', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, moderator.id)
    const thread = await openModmailThread(subject.id, community.id, subject.id)
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: moderator.id,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
    })
    const access = await loadModmailReplyAccess(moderator, community.id, thread.id)

    await expect(
      replyToModmailThread(moderator, access, WEB_PROVENANCE, 'Reply while on vacation'),
    ).resolves.toMatchObject({ created_by_id: moderator.id })
    expect(await getTestConversationParticipants(thread.id)).toContainEqual(
      expect.objectContaining({ user_id: moderator.id, role: 'admin' }),
    )
  })

  it('admits a moderator with the successful first message', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, moderator.id)
    const thread = await openModmailThread(subject.id, community.id, subject.id)
    const access = await loadModmailReplyAccess(moderator, community.id, thread.id)

    const message = await replyToModmailThread(
      moderator,
      access,
      WEB_PROVENANCE,
      'First moderator reply',
    )

    expect(message.conversation_id).toBe(thread.id)
    expect(message.created_by_id).toBe(moderator.id)
    const participants = await getTestConversationParticipants(thread.id)
    expect(participants).toHaveLength(2)
    expect(participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: subject.id, role: 'member' }),
        expect.objectContaining({ user_id: moderator.id, role: 'admin' }),
      ]),
    )
  })

  it('rolls back first-reply admission when the message insert fails', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, moderator.id)
    const thread = await openModmailThread(subject.id, community.id, subject.id)
    const access = await loadModmailReplyAccess(moderator, community.id, thread.id)

    onTestFinished(
      runBeforePostgresStatementForTest('/* createConversationMessage */', async () => {
        throw new Error('injected first-message write failure')
      }),
    )
    await expect(
      replyToModmailThread(moderator, access, WEB_PROVENANCE, 'Valid first reply'),
    ).rejects.toThrow('injected first-message write failure')
    expect(await getTestConversationParticipants(thread.id)).toEqual([
      expect.objectContaining({ user_id: subject.id, role: 'member' }),
    ])
  })

  it('does not admit a moderator when the conversation is at its participant cap', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(conversationParticipantLimitsConfig, {
        participants_per_conversation: 2,
      }),
    )
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, moderator.id)
    const thread = await openModmailThread(owner.id, community.id, subject.id)
    const access = await loadModmailReplyAccess(moderator, community.id, thread.id)

    await expect(
      replyToModmailThread(moderator, access, WEB_PROVENANCE, 'No room for this reply'),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Conversation has reached the maximum of 2 participants',
    })
    expect(await getTestConversationParticipants(thread.id)).toHaveLength(2)
  })
})

describe('assignModmailThread', () => {
  it('sets assigned_moderator_user_id and assigned_at', async () => {
    const owner = await createTestUser()
    const mod = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, mod.id)

    const thread = await openModmailThread(subject.id, community.id, subject.id)
    await assignModmailThread(thread.id, mod.id)

    const fields = await getTestConversationThreadFields(thread.id)
    expect(fields.assigned_moderator_user_id).toBe(mod.id)
    expect(fields.assigned_at).not.toBeNull()
  })
})

describe('resolveModmailThread', () => {
  it('sets resolved_at and resolved_by_id', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)

    const thread = await openModmailThread(subject.id, community.id, subject.id)
    await resolveModmailThread(thread.id, owner.id)

    const fields = await getTestConversationThreadFields(thread.id)
    expect(fields.resolved_at).not.toBeNull()
    expect(fields.resolved_by_id).toBe(owner.id)
  })
})

describe('getCommunityModmailInbox', () => {
  it('returns modmail threads for the community', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)

    const thread = await openModmailThread(subject.id, community.id, subject.id)

    const inbox = await getCommunityModmailInbox(community.id)
    const threadIds = inbox.map(t => t.id)
    expect(threadIds).toContain(thread.id)
  })
})

describe('getMyModmailThreads', () => {
  it('returns modmail threads where user is subject', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)

    const thread = await openModmailThread(subject.id, community.id, subject.id)

    const threads = await getMyModmailThreads(subject.id)
    const threadIds = threads.map(t => t.id)
    expect(threadIds).toContain(thread.id)
  })
})
