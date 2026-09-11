import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ConversationNotificationContext = {
  channel_type: 'direct_message' | 'modmail'
  community_slug: string | null
  subject_user_id: string | null
  participant_user_ids: string[]
}

export async function getConversationNotificationContext(
  conversationId: string,
  excludeSenderId: string | null,
): Promise<ConversationNotificationContext | null> {
  const { rows: convRows } = await read(sql`/* getConversationNotificationContext:conversation */
    SELECT c.channel_type, comm.slug AS community_slug, c.community_id, c.subject_user_id
    FROM conversations c
    LEFT JOIN communities comm ON comm.id = c.community_id
    WHERE c.id = ${conversationId}
      AND c.deleted_at IS NULL
    LIMIT 1
  `)

  if (convRows.length === 0) return null

  const conv = convRows[0] as {
    channel_type: string
    community_slug: string | null
    community_id: string | null
    subject_user_id: string | null
  }

  let participantRows: Array<{ user_id: string }>
  if (conv.channel_type === 'modmail' && conv.community_id) {
    // Use live mod list so newly added/removed mods are correctly included/excluded.
    // Also union conversation_participants to include non-member staff (e.g. site admins
    // who opened or replied via the report-modmail endpoint).
    const modQuery = sql`/* getConversationNotificationContext:modmail-recipients */
      SELECT cm.user_id
      FROM community_members cm
      JOIN users u ON u.id = cm.user_id AND u.deleted_at IS NULL
      WHERE cm.community_id = ${conv.community_id}
        AND cm.role IN ('owner', 'moderator')
        AND cm.removed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM community_member_vacations v
          WHERE v.community_id = cm.community_id
            AND v.user_id      = cm.user_id
            AND v.starts_at   <= now()
            AND (v.ends_at IS NULL OR v.ends_at > now())
        )`
    if (excludeSenderId) {
      modQuery.append(sql` AND cm.user_id != ${excludeSenderId}`)
    }
    if (conv.subject_user_id && conv.subject_user_id !== excludeSenderId) {
      modQuery.append(
        sql`
      UNION
      SELECT u2.id AS user_id
      FROM users u2
      WHERE u2.id = ${conv.subject_user_id}
        AND u2.deleted_at IS NULL`,
      )
    }
    modQuery.append(sql`
      UNION
      SELECT cp.user_id
      FROM conversation_participants cp
      JOIN users u3 ON u3.id = cp.user_id AND u3.deleted_at IS NULL
      WHERE cp.conversation_id = ${conversationId}
        AND cp.removed_at IS NULL
        AND cp.user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM community_members cm2
          WHERE cm2.user_id = cp.user_id
            AND cm2.community_id = ${conv.community_id}
            AND cm2.role IN ('owner', 'moderator')
            AND cm2.removed_at IS NULL
        )`)
    if (excludeSenderId) {
      modQuery.append(sql` AND cp.user_id != ${excludeSenderId}`)
    }
    const { rows } = await read(modQuery)
    participantRows = rows as Array<{ user_id: string }>
  } else {
    const participantQuery = sql`/* getConversationNotificationContext:participants */
      SELECT cp.user_id
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id AND u.deleted_at IS NULL
      WHERE cp.conversation_id = ${conversationId}
        AND cp.removed_at IS NULL
        AND cp.user_id IS NOT NULL`
    if (excludeSenderId) {
      participantQuery.append(sql` AND cp.user_id != ${excludeSenderId}`)
    }
    const { rows } = await read(participantQuery)
    participantRows = rows as Array<{ user_id: string }>
  }

  return {
    channel_type: conv.channel_type as 'direct_message' | 'modmail',
    community_slug: conv.community_slug,
    subject_user_id: conv.subject_user_id,
    participant_user_ids: participantRows.map(r => r.user_id),
  }
}
