export type ChildStage = { deletion: string; remaining: string }

// Once notification push work is drained by exact notification identity, the remaining
// descendants are removed in capped FK order.
export const CHILD_STAGES: readonly ChildStage[] = [
  {
    deletion: `/* deleteConversationMessagePage */
      WITH page AS (
        SELECT message.conversation_id, message.id
        FROM conversation_messages message
        WHERE message.conversation_id = $1::uuid
        ORDER BY message.conversation_id, message.id
        LIMIT $2 FOR UPDATE OF message SKIP LOCKED
      )
      DELETE FROM conversation_messages message
      USING page WHERE (message.conversation_id, message.id) = (page.conversation_id, page.id)`,
    remaining: `/* hasConversationMessages */
      SELECT EXISTS (
        SELECT 1 FROM conversation_messages WHERE conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
  },
  {
    deletion: `/* deleteConversationParticipantPage */
      WITH page AS (
        SELECT participant.conversation_id, participant.id
        FROM conversation_participants participant
        WHERE participant.conversation_id = $1::uuid
        ORDER BY participant.conversation_id, participant.id
        LIMIT $2 FOR UPDATE OF participant SKIP LOCKED
      )
      DELETE FROM conversation_participants participant
      USING page WHERE (participant.conversation_id, participant.id)
        = (page.conversation_id, page.id)`,
    remaining: `/* hasConversationParticipants */
      SELECT EXISTS (
        SELECT 1 FROM conversation_participants WHERE conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
  },
]
