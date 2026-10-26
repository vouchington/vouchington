import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestRetentionDiscussion(input: {
  reportId: string
  communityId: string
  authorId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertTestRetentionDiscussion */
    INSERT INTO conversations (channel_type, moderation_report_id, community_id, created_by_id)
    VALUES ('mod_internal', ${input.reportId}, ${input.communityId}, ${input.authorId})
    RETURNING id
  `)
  return rows[0]!.id
}

export async function getTestRetentionDiscussionMessage(
  conversationId: string,
  messageId: string,
): Promise<{ moderation_report_id: string; body_text: string } | null> {
  const { rows } = await read<{ moderation_report_id: string; body_text: string }>(
    sql`/* getTestRetentionDiscussionMessage */
      SELECT conversation.moderation_report_id, message.body_text
      FROM conversations conversation
      JOIN conversation_messages message ON message.conversation_id = conversation.id
      WHERE conversation.id = ${conversationId} AND message.id = ${messageId}
    `,
  )
  return rows[0] ?? null
}

export async function endTestRetentionDiscussion(
  id: string,
  state: 'resolved' | 'deleted',
): Promise<void> {
  await write(sql`/* endTestRetentionDiscussion */
    UPDATE conversations
    SET resolved_at = CASE WHEN ${state} = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,
        deleted_at = CASE WHEN ${state} = 'deleted' THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ${id}
  `)
}
