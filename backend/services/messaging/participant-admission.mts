import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import {
  CONVERSATION_PARTICIPANT_HARD_MAX,
  getConversationParticipantLimit,
} from './participant-limits.mts'

export type ConversationParticipantRole = 'owner' | 'admin' | 'member'

type AdmitRow = {
  new_count: number
  over_capacity: boolean
  inserted_ids: string[]
  reactivated_ids: string[]
  removed_ids: string[]
  already_active_ids: string[]
}

/**
 * Removed rows retain their slots and count toward the cap. Concurrent admissions choose
 * the same lowest free slots, so the unique index makes a loser reread capacity before retrying.
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
  const ownInsertedIds = new Set<string>()
  const ownReactivatedIds = new Set<string>()
  const alreadyActiveIds = new Set<string>()

  // Each conflict either resolves on the next statement snapshot or is followed by another
  // admission. There can be at most 50 distinct occupied slots in this conversation.
  for (let attempt = 0; attempt <= CONVERSATION_PARTICIPANT_HARD_MAX; attempt += 1) {
    // oxlint-disable no-await-in-loop -- a conflicting insert needs a fresh statement snapshot before retrying.
    // no-mistakes-disable-next-line postgres-conflict-ordering: both slot and user uniqueness can race; shared-conversation callers admit one user and new-conversation batches insert in slot order.
    const { rows } = await query<AdmitRow>( // no-mistakes-disable-line query-reached-per-item: retries the complete bounded batch on slot contention, not one query per user.
      sql`/* admitConversationParticipants */
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
          LIMIT ${CONVERSATION_PARTICIPANT_HARD_MAX}
        ) capped
      ),
      new_users AS (
        SELECT input.user_id, input.role,
          row_number() OVER (ORDER BY input.user_id) AS slot_rank
        FROM input
        WHERE NOT EXISTS (
          SELECT 1 FROM existing WHERE existing.user_id = input.user_id
        )
      ),
      free_slots AS (
        SELECT slot, row_number() OVER (ORDER BY slot) AS slot_rank
        FROM generate_series(1, ${CONVERSATION_PARTICIPANT_HARD_MAX}) AS slot
        WHERE NOT EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = ${conversationId}
            AND cp.participant_slot = slot
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
        INSERT INTO conversation_participants (conversation_id, user_id, role, participant_slot)
        SELECT ${conversationId}, new_users.user_id, new_users.role, free_slots.slot
        FROM new_users
        JOIN free_slots USING (slot_rank)
        WHERE (SELECT total FROM census) + (SELECT count(*)::int FROM new_users) <= ${limit}
        ORDER BY free_slots.slot
        ON CONFLICT DO NOTHING
        RETURNING user_id
      )
      SELECT
        (SELECT count(*)::int FROM new_users) AS new_count,
        EXISTS (SELECT 1 FROM new_users)
          AND (SELECT total FROM census) + (SELECT count(*)::int FROM new_users) > ${limit}
          AS over_capacity,
        COALESCE((SELECT array_agg(user_id) FROM inserted), ARRAY[]::uuid[]) AS inserted_ids,
        COALESCE((SELECT array_agg(user_id) FROM reactivated), ARRAY[]::uuid[])
          AS reactivated_ids,
        COALESCE(
          (SELECT array_agg(existing.user_id) FROM existing WHERE existing.removed_at IS NOT NULL),
          ARRAY[]::uuid[]
        ) AS removed_ids,
        COALESCE(
          (SELECT array_agg(existing.user_id) FROM existing WHERE existing.removed_at IS NULL),
          ARRAY[]::uuid[]
        ) AS already_active_ids
    `,
    )
    // oxlint-enable no-await-in-loop

    const admitted = rows[0]
    if (!admitted) throw new Error('Participant admission returned no result')
    for (const userId of admitted.already_active_ids) {
      if (!ownInsertedIds.has(userId) && !ownReactivatedIds.has(userId)) {
        alreadyActiveIds.add(userId)
      }
    }
    for (const userId of admitted.inserted_ids) ownInsertedIds.add(userId)
    for (const userId of admitted.reactivated_ids) {
      ownReactivatedIds.add(userId)
      alreadyActiveIds.delete(userId)
    }
    if (admitted.over_capacity) {
      throw createHttpError(400, `Conversation has reached the maximum of ${limit} participants`)
    }
    const lostReactivation = admitted.removed_ids.some(userId => !ownReactivatedIds.has(userId))
    if (admitted.new_count === admitted.inserted_ids.length && !lostReactivation) {
      return { alreadyActiveIds: [...alreadyActiveIds] }
    }
  }

  throw createHttpError(409, 'Concurrent participant admissions; retry')
}
