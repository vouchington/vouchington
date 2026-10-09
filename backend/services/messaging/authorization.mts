/**
 * Participant-route authorization contract — cross-file summary
 *
 * Mutation routes (POST/DELETE/PATCH) in backend/api/v1/my/messages-participants.mts apply
 * guards at two layers. Every new participant mutation route must apply both layers in full.
 *
 * Route layer (messages-participants.mts):
 *   - POST/PATCH:  requireAuth + assertNotSuspended; POST also rejects self-add → 400
 *   - DELETE:      requireAuth + assertNotSuspended + currentUserCanViewConversation → 403
 *
 * Service layer (participants.mts → this file):
 *   - POST add:    currentUserCanManageParticipants → 403; inline cap (26) → 400;
 *                  inline already-participant → 409; inline user-existence → 404;
 *                  currentUserCanMessageUsers (message-eligibility.mts) → 403; block-mute pair check → 403
 *   - DELETE:      inline owner-vs-self semantics; inline ownership for remove-other → 403
 *   - PATCH policy: currentUserCanChangeParticipantPolicy → 403
 *
 * Rejection-path tests (the enforcing guardians, not this comment):
 *   backend/api/v1/my/__tests__/messages-participants.test.mts
 *   backend/services/messaging/participants.test.mts
 */
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  isAnyUserBlockedOrMuted,
  anyPairAmongUsersBlockedOrMuted,
} from '@services/entity-relations/check-block-mute'
export async function currentUserCanViewConversation(
  currentUserId: string,
  conversationId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* currentUserCanViewConversation */
    SELECT 1
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
      AND c.channel_type = 'direct_message'
      AND c.deleted_at IS NULL
    WHERE cp.conversation_id = ${conversationId}
      AND cp.user_id = ${currentUserId}
      AND cp.removed_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function currentUserCanSendMessage(
  currentUserId: string,
  conversationId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* currentUserCanSendMessage */
    SELECT cp.user_id
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
      AND c.channel_type = 'direct_message'
      AND c.deleted_at IS NULL
    JOIN users u ON u.id = cp.user_id AND u.deleted_at IS NULL
    WHERE cp.conversation_id = ${conversationId}
      AND cp.removed_at IS NULL
  `)

  const participantIds = (rows as Array<{ user_id: string }>).map(r => r.user_id)
  if (!participantIds.includes(currentUserId)) return false

  const otherIds = participantIds.filter(id => id !== currentUserId)
  // If all other participants have soft-deleted their accounts, block sends — there
  // is no one left to receive the message (consistent with the create-DM gate).
  if (otherIds.length === 0) return false
  if (await isAnyUserBlockedOrMuted(currentUserId, otherIds)) return false
  // For group convs: also block sends when any non-sender pair has a block/mute relation,
  // keeping the same invariant enforced at group creation time.
  if (otherIds.length > 1 && (await anyPairAmongUsersBlockedOrMuted(otherIds))) return false
  return true
}

export async function currentUserCanManageParticipants(
  currentUserId: string,
  conversationId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* currentUserCanManageParticipants */
    SELECT c.created_by_id, c.participant_add_policy
    FROM conversations c
    WHERE c.id = ${conversationId}
      AND c.channel_type = 'direct_message'
      AND c.deleted_at IS NULL
    LIMIT 1
  `)
  const conv = rows[0] as
    | { created_by_id: string | null; participant_add_policy: string }
    | undefined
  if (!conv) return false
  if (conv.created_by_id === currentUserId) return true
  if (conv.participant_add_policy === 'all_members') {
    const { rows: pRows } = await read(sql`/* currentUserCanManageParticipants:check_participant */
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = ${conversationId}
        AND user_id = ${currentUserId}
        AND removed_at IS NULL
      LIMIT 1
    `)
    return pRows.length > 0
  }
  return false
}

export async function currentUserCanChangeParticipantPolicy(
  currentUserId: string,
  conversationId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* currentUserCanChangeParticipantPolicy */
    SELECT 1
    FROM conversations
    WHERE id = ${conversationId}
      AND channel_type = 'direct_message'
      AND deleted_at IS NULL
      AND created_by_id = ${currentUserId}
    LIMIT 1
  `)
  return rows.length > 0
}
