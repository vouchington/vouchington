import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { getConversationParticipantLimit } from './participant-limits.mts'

export type ConversationParticipantRole = 'owner' | 'admin' | 'member'

type AdmitRow = {
  new_count: number
  inserted_count: number
  already_active_ids: string[] | null
}

/**
 * One admission for every conversation. Removed rows count, and re-adding a user
 * clears removal on the existing row. The conversation-scoped advisory lock serializes
 * the count and write without locking the conversation parent.
 */
export async function admitConversationParticipants(
  query: TransactionQuery,
  conversationId: string,
  participants: readonly { userId: string; role: ConversationParticipantRole }[],
): Promise<{ alreadyActiveIds: string[] }> {
  const byUser = new Map<string, ConversationParticipantRole>()
  for (const participant of participants) {
    if (!byUser.has(participant.userId)) byUser.set(participant.userId, participant.role)
  }
  if (byUser.size === 0) return { alreadyActiveIds: [] }

  const userIds: string[] = []
  const roles: ConversationParticipantRole[] = []
  for (const [userId, role] of byUser) {
    userIds.push(userId)
    roles.push(role)
  }
  const limit = getConversationParticipantLimit()

  await query(sql`/* admitConversationParticipants:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(
      'conversation-participant-admission:' || ${conversationId}, 0
    ))
  `)

  const { rows } = await query<AdmitRow>(sql`/* admitConversationParticipants */
    WITH input AS (
      SELECT incoming.user_id, incoming.role::conversation_participant_roles AS role
      FROM unnest(${userIds}::uuid[], ${roles}::text[]) AS incoming(user_id, role)
    ),
    existing AS (
      SELECT cp.user_id, cp.removed_at
      FROM conversation_participants cp
      JOIN input ON input.user_id = cp.user_id
      WHERE cp.conversation_id = ${conversationId}
    ),
    census AS (
      SELECT count(*)::int AS total
      FROM (
        SELECT 1 FROM conversation_participants
        WHERE conversation_id = ${conversationId}
        LIMIT ${limit}
      ) capped
    ),
    new_users AS (
      SELECT input.user_id, input.role
      FROM input
      WHERE NOT EXISTS (
        SELECT 1 FROM existing WHERE existing.user_id = input.user_id
      )
    ),
    reactivated AS (
      UPDATE conversation_participants cp
      SET removed_at = NULL, removed_by_id = NULL, role = input.role
      FROM input
      WHERE cp.conversation_id = ${conversationId}
        AND cp.user_id = input.user_id
        AND cp.removed_at IS NOT NULL
      RETURNING cp.user_id
    ),
    inserted AS (
      INSERT INTO conversation_participants (conversation_id, user_id, role)
      SELECT ${conversationId}, new_users.user_id, new_users.role
      FROM new_users
      WHERE (SELECT total FROM census) + (SELECT count(*)::int FROM new_users) <= ${limit}
      ORDER BY new_users.user_id
      RETURNING user_id
    )
    SELECT
      (SELECT count(*)::int FROM new_users) AS new_count,
      (SELECT count(*)::int FROM inserted) AS inserted_count,
      (SELECT count(*)::int FROM reactivated) AS reactivated_count,
      COALESCE(
        (SELECT array_agg(existing.user_id) FROM existing WHERE existing.removed_at IS NULL),
        ARRAY[]::uuid[]
      ) AS already_active_ids
  `)

  const admitted = rows[0]
  if (!admitted || admitted.new_count > admitted.inserted_count) {
    throw createHttpError(400, `Conversation has reached the maximum of ${limit} participants`)
  }
  return { alreadyActiveIds: admitted.already_active_ids ?? [] }
}
