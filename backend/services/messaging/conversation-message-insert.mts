import sql from 'sql-template-strings'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'

export function conversationMessageInsert(
  currentUserId: string,
  provenance: ContentProvenance,
  conversationId: string,
  bodyText: string,
) {
  return sql`/* createConversationMessage */
    WITH participant_check AS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = ${conversationId}
        AND user_id = ${currentUserId}
        AND removed_at IS NULL
    ),
    new_message AS (
      INSERT INTO conversation_messages (
        conversation_id, kind, body_text, created_by_id, created_via, created_via_oauth_client_id
      )
      SELECT ${conversationId}, 'message', ${bodyText}, ${currentUserId},
        ${provenance.createdVia}, ${provenance.oauthClientId}
      WHERE EXISTS (SELECT 1 FROM participant_check)
      RETURNING id, conversation_id, body_text, created_by_id, created_at, updated_at, deleted_at
    ),
    touch_conversation AS (
      UPDATE conversations SET last_activity_at = CURRENT_TIMESTAMP
      WHERE id = ${conversationId} AND EXISTS (SELECT 1 FROM participant_check)
    )
    SELECT * FROM new_message
  `
}
