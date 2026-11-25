import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES } from '@services/communities/membership-limits'
import { CONVERSATION_PARTICIPANT_HARD_MAX } from '@services/messaging/participant-limits'
import sql from 'sql-template-strings'
import { seedUuid } from '../seed-data/common.mts'

/** Model the sender in one slot and fill the other slots with staff outside the community. */
export async function withCapacityModmailConversation(
  senderId: string,
  work: (conversationId: string, recipients: string[]) => Promise<void>,
) {
  const moderatorIds = Array.from(
    { length: COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.moderators_per_community },
    (_, index) => seedUuid(11_000 + index, '01'),
  )
  const ownerId = moderatorIds[0]!
  const slug = `explain-modmail-write-${randomUUID()}`
  const {
    rows: [community],
  } = await write<{ id: string }>(sql`/* seedExplainModmailNotificationCommunity */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    VALUES ('Explain modmail write capacity', ${slug}, ${ownerId}, 'system')
    RETURNING id
  `)
  assert.ok(community)
  let staffIds: string[] = []
  try {
    await write(sql`/* seedExplainModmailNotificationModerators */
      INSERT INTO community_members (community_id, user_id, role)
      SELECT ${community.id}::uuid, user_id,
        CASE WHEN ordinal = 1 THEN 'owner'::community_member_roles ELSE 'moderator' END
      FROM unnest(${moderatorIds}::uuid[]) WITH ORDINALITY AS fixture(user_id, ordinal)
      UNION ALL
      SELECT ${community.id}::uuid, ${senderId}::uuid, 'member'::community_member_roles
    `)
    const { rows: staff } = await write<{
      id: string
    }>(sql`/* seedExplainModmailNotificationStaff */
      INSERT INTO users (username)
      SELECT 'explain-staff-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
      FROM generate_series(1, ${CONVERSATION_PARTICIPANT_HARD_MAX - 1}::integer)
      RETURNING id
    `)
    staffIds = staff.map(user => user.id)
    const { rowCount } = await write(sql`/* grantExplainModmailNotificationStaffRole */
      INSERT INTO user_roles (user_id, role_type_id)
      SELECT staff.user_id, role.id
      FROM unnest(${staffIds}::uuid[]) AS staff(user_id)
      JOIN user_role_types role ON role.slug = 'moderator'
    `)
    assert.equal(rowCount, staffIds.length, 'The fixture needs the site moderator role')
    const {
      rows: [conversation],
    } = await write<{ id: string }>(sql`/* seedExplainModmailNotificationConversation */
      INSERT INTO conversations (channel_type, created_by_id, community_id, subject_user_id)
      VALUES ('modmail', ${senderId}, ${community.id}, ${senderId})
      RETURNING id
    `)
    assert.ok(conversation)
    const conversationId = conversation.id

    await write(sql`/* seedExplainModmailNotificationParticipants */
      INSERT INTO conversation_participants (conversation_id, user_id, role, participant_slot)
      SELECT ${conversationId}, user_id,
        CASE WHEN ordinal = 1 THEN 'member'::conversation_participant_roles ELSE 'admin' END,
        ordinal::smallint
      FROM unnest(${[senderId, ...staffIds]}::uuid[]) WITH ORDINALITY AS fixture(user_id, ordinal)
    `)
    await work(conversationId, [...moderatorIds, ...staffIds])
  } finally {
    await write(sql`/* cleanupExplainModmailNotificationCommunity */
      DELETE FROM communities WHERE id = ${community.id}
    `)
    // The community FK has cascading cleanup for the conversation and its notification rows.
    if (staffIds.length > 0)
      await write(sql`/* cleanupExplainModmailNotificationStaff */
        DELETE FROM users WHERE id = ANY(${staffIds}::uuid[])
      `)
  }
}
