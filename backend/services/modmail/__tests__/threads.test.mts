import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  getTestConversationParticipants,
  getTestConversationThreadFields,
} from '@voucha/test-helpers'
import { openModmailThread, assignModmailThread, resolveModmailThread } from '../threads.mts'
import { getCommunityModmailInbox, getMyModmailThreads } from '../threads-get.mts'

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

  it('adds all community mods as admin participants', async () => {
    const owner = await createTestUser()
    const mod1 = await createTestUser()
    const mod2 = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, mod1.id)
    await addModToCommunity(community.id, mod2.id)

    const thread = await openModmailThread(subject.id, community.id, subject.id)

    const participants = await getTestConversationParticipants(thread.id)

    const adminUserIds = participants
      .reduce<string[]>((acc, p) => {
        if (p.role === 'admin') acc.push(p.user_id)
        return acc
      }, [])
      .sort()

    expect(adminUserIds).toContain(owner.id)
    expect(adminUserIds).toContain(mod1.id)
    expect(adminUserIds).toContain(mod2.id)

    const memberParticipant = participants.find(p => p.role === 'member')
    expect(memberParticipant?.user_id).toBe(subject.id)
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

  it('adds non-subject caller as admin participant on existing thread', async () => {
    const owner = await createTestUser()
    const staff = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)

    // Create the thread as the subject first
    const thread = await openModmailThread(subject.id, community.id, subject.id)

    // Staff opens the same thread (returns existing) — staff must be added as participant
    const sameThread = await openModmailThread(staff.id, community.id, subject.id)
    expect(sameThread.id).toBe(thread.id)

    const participants = await getTestConversationParticipants(thread.id)
    const staffParticipant = participants.find(p => p.user_id === staff.id)
    expect(staffParticipant?.role).toBe('admin')
  })
})

describe('assignModmailThread', () => {
  it('sets assigned_mod_id and assigned_at', async () => {
    const owner = await createTestUser()
    const mod = await createTestUser()
    const subject = await createTestUser()
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, mod.id)

    const thread = await openModmailThread(subject.id, community.id, subject.id)
    await assignModmailThread(thread.id, mod.id)

    const fields = await getTestConversationThreadFields(thread.id)
    expect(fields.assigned_mod_id).toBe(mod.id)
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
