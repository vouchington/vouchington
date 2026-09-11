import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  createTestDirectConversation,
  createTestModmailThread,
  insertTestCommunityVacation,
  softDeleteUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { getConversationNotificationContext } from './get-conversation-notification-context.mts'

// Uses createTestModmailThread/insertTestCommunityVacation (raw inserts) rather than
// @services/modmail's openModmailThread / @services/community-member-vacations' setMyCommunityVacation:
// communities depends on notifications (forward), and modmail/community-member-vacations both depend
// on communities (forward), so a notifications->modmail or notifications->community-member-vacations
// devDependency would complete a 3-cycle. getConversationNotificationContext queries conversations/
// community_members/community_member_vacations/conversation_participants directly, so these raw
// inserts reproduce the exact rows the real functions would create.
describe('getConversationNotificationContext', () => {
  it('returns null when conversation does not exist', async () => {
    const result = await getConversationNotificationContext(
      '00000000-0000-7000-8000-000000000001',
      null,
    )
    expect(result).toBeNull()
  })

  it('returns correct channel_type and participant_user_ids for a DM conversation', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()

    const conversation = await createTestDirectConversation({
      user1Id: user1.id,
      user2Id: user2.id,
    })

    const result = await getConversationNotificationContext(conversation.id, null)

    expect(result).not.toBeNull()
    expect(result!.channel_type).toBe('direct_message')
    expect(result!.community_slug).toBeNull()
    expect(result!.subject_user_id).toBeNull()
    expect(result!.participant_user_ids).toHaveLength(2)
    expect(result!.participant_user_ids).toContain(user1.id)
    expect(result!.participant_user_ids).toContain(user2.id)
  })

  it('excludes senderId from participant_user_ids when excludeSenderId is provided', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const conversation = await createTestDirectConversation({
      user1Id: sender.id,
      user2Id: recipient.id,
    })

    const result = await getConversationNotificationContext(conversation.id, sender.id)

    expect(result).not.toBeNull()
    expect(result!.participant_user_ids).not.toContain(sender.id)
    expect(result!.participant_user_ids).toContain(recipient.id)
  })

  it('returns all participants when excludeSenderId is null', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()

    const conversation = await createTestDirectConversation({
      user1Id: user1.id,
      user2Id: user2.id,
    })

    const result = await getConversationNotificationContext(conversation.id, null)

    expect(result).not.toBeNull()
    expect(result!.participant_user_ids).toHaveLength(2)
  })

  it('returns modmail channel_type and community_slug for modmail conversations', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()

    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const thread = await createTestModmailThread({
      communityId: community.id,
      subjectUserId: subject.id,
      modUserId: owner.id,
    })

    const result = await getConversationNotificationContext(thread.id, owner.id)

    expect(result).not.toBeNull()
    expect(result!.channel_type).toBe('modmail')
    expect(result!.community_slug).toBe(community.slug)
    expect(result!.subject_user_id).toBe(subject.id)
    expect(result!.participant_user_ids).not.toContain(owner.id)
    expect(result!.participant_user_ids).toContain(subject.id)
  })

  it('excludes soft-deleted participants from DM notification recipients', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()

    const conversation = await createTestDirectConversation({
      user1Id: user1.id,
      user2Id: user2.id,
    })

    await softDeleteUser(user2.id)

    const result = await getConversationNotificationContext(conversation.id, user1.id)

    expect(result).not.toBeNull()
    expect(result!.participant_user_ids).not.toContain(user2.id)
  })

  it('excludes soft-deleted moderators from modmail notification recipients', async () => {
    const owner = await createTestUser()
    const mod = await createTestUser()
    const subject = await createTestUser()

    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: mod.id, role: 'moderator' }),
    ])
    const thread = await createTestModmailThread({
      communityId: community.id,
      subjectUserId: subject.id,
      modUserId: owner.id,
    })

    await softDeleteUser(mod.id)

    const result = await getConversationNotificationContext(thread.id, subject.id)

    expect(result).not.toBeNull()
    expect(result!.participant_user_ids).not.toContain(mod.id)
  })

  it('excludes soft-deleted subject from modmail notification recipients', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()

    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const thread = await createTestModmailThread({
      communityId: community.id,
      subjectUserId: subject.id,
      modUserId: owner.id,
    })

    await softDeleteUser(subject.id)

    const result = await getConversationNotificationContext(thread.id, owner.id)

    expect(result).not.toBeNull()
    expect(result!.participant_user_ids).not.toContain(subject.id)
  })

  it('excludes on-vacation moderators from modmail notification recipients', async () => {
    const owner = await createTestUser()
    const mod = await createTestUser()
    const subject = await createTestUser()

    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: mod.id, role: 'moderator' }),
    ])
    await insertTestCommunityVacation({ communityId: community.id, userId: mod.id })
    const thread = await createTestModmailThread({
      communityId: community.id,
      subjectUserId: subject.id,
      modUserId: owner.id,
    })

    const result = await getConversationNotificationContext(thread.id, subject.id)

    expect(result).not.toBeNull()
    expect(result!.participant_user_ids).not.toContain(mod.id)
    expect(result!.participant_user_ids).toContain(owner.id)
  })

  it('includes staff participant who is a regular community member in modmail notification recipients', async () => {
    // Staff user is a plain 'member' of the community — not owner/moderator.
    // They are given an admin conversation_participants row directly (modUserId), matching what
    // openModmailThread's caller-upsert-as-admin step does for the real staff-reply path.
    // The NOT EXISTS exclusion must only exclude active owner/moderator rows, not all members.
    const owner = await createTestUser()
    const subject = await createTestUser()
    const staffMember = await createTestUser()

    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: staffMember.id,
        role: 'member',
      }),
    ])

    // Staff opens the thread, which upserts them as an admin participant.
    const thread = await createTestModmailThread({
      communityId: community.id,
      subjectUserId: subject.id,
      modUserId: staffMember.id,
    })

    const result = await getConversationNotificationContext(thread.id, subject.id)

    expect(result).not.toBeNull()
    expect(result!.participant_user_ids).toContain(staffMember.id)
  })
})
