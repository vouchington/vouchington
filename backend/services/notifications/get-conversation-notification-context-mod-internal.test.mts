import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityVacation,
  insertTestModerationReport,
  insertTestPost,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import { createTestModInternalConversation } from '@voucha/test-helpers/entities/conversation-participant-rows'
import { removeTestConversationParticipant } from '@voucha/test-helpers/entities/conversations'
import { getConversationNotificationContext } from './get-conversation-notification-context.mts'

describe('mod_internal notification recipients', () => {
  it('reads live staff and participants, not the reporter or the post author', async () => {
    const owner = await createTestUser()
    const activeMod = await createTestUser()
    const vacationMod = await createTestUser()
    const staffParticipant = await createTestUser()
    const reporter = await createTestUser()
    const postAuthor = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: activeMod.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: vacationMod.id,
      role: 'moderator',
    })
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: vacationMod.id,
      startsAt: '2020-01-01T00:00:00.000Z',
    })
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `mod-internal-notify-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Internal notify',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const { id: conversationId } = await createTestModInternalConversation({
      communityId: community.id,
      createdById: owner.id,
      moderationReportId: reportId,
      participantUserIds: [owner.id, staffParticipant.id],
    })

    const context = await getConversationNotificationContext(conversationId, owner.id)

    expect(context?.channel_type).toBe('mod_internal')
    expect(context?.participant_user_ids).toContain(activeMod.id)
    expect(context?.participant_user_ids).toContain(staffParticipant.id)
    expect(context?.participant_user_ids).not.toContain(owner.id)
    expect(context?.participant_user_ids).not.toContain(vacationMod.id)
    expect(context?.participant_user_ids).not.toContain(reporter.id)
    expect(context?.participant_user_ids).not.toContain(postAuthor.id)

    await removeTestCommunityMember(community.id, activeMod.id)
    await removeTestConversationParticipant(conversationId, staffParticipant.id)
    const afterRemoval = await getConversationNotificationContext(conversationId, owner.id)
    expect(afterRemoval?.participant_user_ids).not.toContain(activeMod.id)
    expect(afterRemoval?.participant_user_ids).not.toContain(staffParticipant.id)
  })
})
