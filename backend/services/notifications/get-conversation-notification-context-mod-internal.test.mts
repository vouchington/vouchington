import { describe, expect, it } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityVacation,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
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
    const { rows } = await write<{ id: string }>(sql`/* modInternalNotificationFixture */
      INSERT INTO conversations (channel_type, community_id, moderation_report_id, created_by_id)
      VALUES ('mod_internal', ${community.id}, ${reportId}, ${owner.id})
      RETURNING id
    `)
    const conversationId = rows[0]?.id
    if (!conversationId) throw new Error('fixture conversation missing')
    await write(sql`/* modInternalNotificationFixture */
      INSERT INTO conversation_participants (conversation_id, user_id, role)
      VALUES
        (${conversationId}, ${owner.id}, 'admin'),
        (${conversationId}, ${staffParticipant.id}, 'admin')
    `)

    const context = await getConversationNotificationContext(conversationId, owner.id)

    expect(context?.channel_type).toBe('mod_internal')
    expect(context?.participant_user_ids).toContain(activeMod.id)
    expect(context?.participant_user_ids).toContain(staffParticipant.id)
    expect(context?.participant_user_ids).not.toContain(owner.id)
    expect(context?.participant_user_ids).not.toContain(vacationMod.id)
    expect(context?.participant_user_ids).not.toContain(reporter.id)
    expect(context?.participant_user_ids).not.toContain(postAuthor.id)
  })
})
