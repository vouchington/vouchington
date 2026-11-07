import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { userHasLiveCommunityStaffRole } from '@services/community-member-vacations/live-staff'
import { admitConversationParticipants } from '@services/messaging/participant-admission'
import { getConversationNotificationContext } from '@services/notifications/get-conversation-notification-context'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, heavyFollowUser, seedPostId, seedUser } from '../run-support.mts'

// The seeded community owner is admitted nowhere until this fixture. A live moderator is admitted
// inside a rolled-back transaction, and the notification read stays on the committed opener row.
export async function runConversationParticipantAdmission(communityId: string): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`/* explainParticipantAdmissionFixture */
    INSERT INTO conversations (channel_type, community_id, post_id, created_by_id)
    VALUES ('mod_internal', ${communityId}, ${seedPostId}, ${seedUser.id})
    RETURNING id
  `)
  const conversationId = rows[0]?.id
  if (!conversationId) throw new Error('The admission scenario needs a mod_internal conversation')
  await write(sql`/* explainParticipantAdmissionFixture */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (${conversationId}, ${seedUser.id}, 'admin')
  `)

  registerScenarioContract('conversation-participant-admission', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_conversation_participants__conversation_user'],
        queryContains: 'reactivated',
      },
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_members__unique', 'idx_community_members__active_moderators'],
        anyOf: true,
        queryContains: 'userHasLiveCommunityStaffRole',
      },
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_members__active_moderators', 'idx_community_members__unique'],
        anyOf: true,
        queryContains: 'mod-internal-recipients',
      },
      // Point lookups on one conversation and its two live staff. Budgets add headroom.
      { kind: 'maxProcessedRows', relation: 'conversation_participants', max: 16 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 8 },
      { kind: 'maxProcessedRows', relation: 'community_member_vacations', max: 8 },
      { kind: 'maxProcessedRows', relation: 'users', max: 8 },
    ],
  })

  try {
    await runAndCapture(
      'conversation-participant-admission',
      async () => {
        const live = await userHasLiveCommunityStaffRole(seedUser.id, communityId)
        if (!live) throw new Error('The seeded owner must be live community staff')
        await using transaction = await beginTransaction()
        await admitConversationParticipants(transaction, conversationId, [
          { userId: heavyFollowUser.id, role: 'admin' },
        ])
        await transaction.rollback()
        const context = await getConversationNotificationContext(conversationId, seedUser.id)
        if (context?.channel_type !== 'mod_internal') {
          throw new Error('The admission scenario must read a mod_internal thread')
        }
        if (!context.participant_user_ids.includes(heavyFollowUser.id)) {
          throw new Error('The live moderator must be a notification recipient')
        }
      },
      undefined,
      [
        'userHasLiveCommunityStaffRole',
        'admitConversationParticipants:lock',
        'admitConversationParticipants',
        'getConversationNotificationContext:mod-internal-recipients',
      ],
    )
  } finally {
    await write(sql`/* explainParticipantAdmissionFixture */
      DELETE FROM conversations WHERE id = ${conversationId}
    `)
  }
}
