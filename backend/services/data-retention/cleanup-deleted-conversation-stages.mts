import type { TransactionQuery } from '@data-stores/psql'

export type ChildStage = {
  deletion: (
    query: TransactionQuery,
    conversationId: string,
    batchSize: number,
  ) => Promise<{ rowCount: number | null }>
  remaining: (
    query: TransactionQuery,
    conversationId: string,
  ) => Promise<{ rows: { remaining: boolean }[] }>
}

// Once notification push work is drained by exact notification identity, the remaining
// descendants are removed in capped FK order.
export const CHILD_STAGES: readonly ChildStage[] = [
  {
    deletion: (query, conversationId, batchSize) =>
      query(
        `/* deleteConversationMessagePage */
      DELETE FROM conversation_messages target
      WHERE target.conversation_id = $1::uuid
        AND target.id = ANY(ARRAY(
          SELECT message.id
          FROM conversation_messages message
          WHERE message.conversation_id = $1::uuid
          ORDER BY message.conversation_id, message.id
          -- lock-reason: prevents: waiting on a message while holding its conversation lock, writer: account purge clearing its author through the user FK.
          -- Cost the ordered walk before the runtime page size is known.
          LIMIT (SELECT $2::bigint) FOR UPDATE OF message SKIP LOCKED
        ))`,
        [conversationId, batchSize],
      ),
    remaining: (query, conversationId) =>
      query<{ remaining: boolean }>(
        `/* hasConversationMessages */
      SELECT EXISTS (
        SELECT 1 FROM conversation_messages WHERE conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
        [conversationId],
      ),
  },
  {
    deletion: (query, conversationId, batchSize) =>
      query(
        `/* deleteConversationParticipantPage */
      DELETE FROM conversation_participants target
      WHERE target.conversation_id = $1::uuid
        AND target.id = ANY(ARRAY(
          SELECT participant.id
          FROM conversation_participants participant
          WHERE participant.conversation_id = $1::uuid
          ORDER BY participant.conversation_id, participant.id
          -- lock-reason: prevents: waiting on a participant while holding its conversation lock, writer: account purge deleting the participant through the user FK.
          -- Cost the ordered walk before the runtime page size is known.
          LIMIT (SELECT $2::bigint) FOR UPDATE OF participant SKIP LOCKED
        ))`,
        [conversationId, batchSize],
      ),
    remaining: (query, conversationId) =>
      query<{ remaining: boolean }>(
        `/* hasConversationParticipants */
      SELECT EXISTS (
        SELECT 1 FROM conversation_participants WHERE conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
        [conversationId],
      ),
  },
]
