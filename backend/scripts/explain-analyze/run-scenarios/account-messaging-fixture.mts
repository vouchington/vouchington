import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

const PARTICIPANTS = 50

export async function seedAccountMessagingFixture() {
  await using query = await beginTransaction()
  const tag = `explain-msg-${randomUUID().slice(0, 8)}`
  const { rows: users } = await query<{ id: string }>(sql`/* seedAccountMessagingUsers */
    INSERT INTO users (username) SELECT ${tag} || '-' || n FROM generate_series(1, 70) n
    RETURNING id`)
  const userIds = users.map(user => user.id)
  const [subjectId, otherSubjectId] = userIds
  if (!subjectId || !otherSubjectId) throw new Error('Missing messaging fixture subjects')
  const { rows: communities } = await query<{
    id: string
  }>(sql`/* seedAccountMessagingCommunities */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    VALUES ('Explain member inbox', ${`${tag}-home`}, ${subjectId}, 'system'),
      ('Explain adjacent inbox', ${`${tag}-away`}, ${otherSubjectId}, 'system')
    RETURNING id`)
  const communityIds = communities.map(row => row.id)
  const [communityId, otherCommunityId] = communityIds
  if (!communityId || !otherCommunityId) throw new Error('Missing messaging fixture communities')

  const { rows: threads } = await query<{
    id: string
    community_id: string
    subject_user_id: string
    last_activity_at: Date
    deleted_at: Date | null
  }>(sql`/* seedAccountModmailThreads */
    INSERT INTO conversations (channel_type, community_id, subject_user_id, created_by_id,
      resolved_at, last_activity_at, deleted_at)
    SELECT 'modmail', community_id, subject_id, subject_id, CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP - ((n - 1) / 6) * interval '1 minute',
      CASE WHEN n % 17 = 0 THEN CURRENT_TIMESTAMP END
    FROM (
      SELECT community_id, subject_id, thread_count
      FROM (VALUES (${communityId}::uuid, ${subjectId}::uuid, 180),
        (${otherCommunityId}::uuid, ${subjectId}::uuid, 140),
        (${communityId}::uuid, ${otherSubjectId}::uuid, 200)
      ) AS owned(community_id, subject_id, thread_count)
      UNION ALL
      SELECT ${otherCommunityId}::uuid, subject_id, 55
      FROM unnest(${userIds.slice(2)}::uuid[]) AS background(subject_id)
    ) AS inbox
    CROSS JOIN generate_series(1, inbox.thread_count) n
    RETURNING id, community_id, subject_user_id, last_activity_at, deleted_at`)
  const inbox = threads
    .filter(
      row =>
        row.community_id === communityId &&
        row.subject_user_id === subjectId &&
        row.deleted_at === null,
    )
    .toSorted(
      (left, right) =>
        right.last_activity_at.getTime() - left.last_activity_at.getTime() ||
        right.id.localeCompare(left.id),
    )
  const transcriptId = inbox[0]?.id
  if (!transcriptId) throw new Error('Missing modmail transcript')
  const threadIds = threads.map(row => row.id)
  const { rows: messages } = await query<{ id: string; kind: string; deleted_at: Date | null }>(sql`
    /* seedAccountModmailTranscript */
    INSERT INTO conversation_messages (conversation_id, created_by_id, created_via,
      kind, direction, body_text, deleted_at)
    SELECT ${transcriptId}, CASE WHEN n % 9 <> 0 THEN ${subjectId}::uuid END, 'system',
      CASE WHEN n % 8 = 0 THEN 'note'::conversation_message_kinds ELSE 'message' END,
      CASE WHEN n % 8 = 0 THEN 'outbound'::conversation_message_directions END,
      'Explain transcript entry ' || n, CASE WHEN n % 7 = 0 THEN CURRENT_TIMESTAMP END
    FROM generate_series(1, 240) n
    RETURNING id, kind, deleted_at`)
  await query(sql`/* seedAccountModmailBackgroundMessages */
    INSERT INTO conversation_messages (conversation_id, created_by_id, created_via, kind, body_text)
    SELECT conversation_id, ${otherSubjectId}, 'system', 'message', 'Adjacent community transcript'
    FROM unnest(${threadIds.filter(id => id !== transcriptId)}::uuid[]) AS threads(conversation_id)
    CROSS JOIN generate_series(1, 5) n`)
  const { rows: direct } = await query<{ id: string }>(sql`/* seedAccountParticipantConversations */
    INSERT INTO conversations (channel_type, created_by_id)
    SELECT 'direct_message', ${subjectId} FROM generate_series(1, 161) n
    RETURNING id`)
  const directIds = direct.map(row => row.id)
  const participantConversationId = directIds[0]
  if (!participantConversationId) throw new Error('Missing conversation for participant page')
  const { rows: participants } = await query<{
    id: string
    conversation_id: string
    user_id: string
  }>(sql`
    /* seedAccountConversationParticipants */
    INSERT INTO conversation_participants (conversation_id, user_id, role, participant_slot, removed_at)
    SELECT conversation_id, user_id, CASE WHEN slot = 1 THEN 'owner'::conversation_participant_roles
      ELSE 'member' END, slot,
      CASE WHEN conversation_id <> ${participantConversationId} AND slot % 3 = 0
        THEN CURRENT_TIMESTAMP END
    FROM unnest(${directIds}::uuid[]) AS conversations(conversation_id)
    CROSS JOIN unnest(${userIds.slice(0, PARTICIPANTS)}::uuid[]) WITH ORDINALITY AS users(user_id, slot)
    WHERE conversation_id = ${participantConversationId} OR slot <= 12
    RETURNING id, conversation_id, user_id`)
  await query.commit()
  return {
    userIds,
    communityIds,
    conversationIds: [...threadIds, ...directIds],
    subjectId,
    communityId,
    transcriptId,
    participantConversationId,
    threadIds: inbox.map(row => row.id),
    messageIds: messages
      .filter(row => row.kind === 'message' && row.deleted_at === null)
      .map(row => row.id)
      .toSorted(),
    participants: participants
      .filter(row => row.conversation_id === participantConversationId)
      .toSorted((left, right) => left.id.localeCompare(right.id)),
  }
}

export async function deleteAccountMessagingFixture(
  fixture: Awaited<ReturnType<typeof seedAccountMessagingFixture>>,
) {
  await using query = await beginTransaction()
  await query(sql`/* deleteAccountMessagingConversations */ DELETE FROM conversations
    WHERE id = ANY(${fixture.conversationIds}::uuid[])`)
  await query(sql`/* deleteAccountMessagingCommunities */ DELETE FROM communities
    WHERE id = ANY(${fixture.communityIds}::uuid[])`)
  await query(
    sql`/* deleteAccountMessagingUsers */ DELETE FROM users WHERE id = ANY(${fixture.userIds}::uuid[])`,
  )
  await query(sql`/* deleteAccountMessagingUserIdentities */ DELETE FROM retained_user_identities
    WHERE id = ANY(${fixture.userIds}::uuid[])`)
  await query.commit()
  await write(
    '/* restoreAccountMessagingStats */ VACUUM (ANALYZE) conversations, conversation_messages, conversation_participants',
  )
}
