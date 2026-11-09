import { read, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { userHasLiveCommunityStaffRole } from '@services/community-member-vacations/live-staff'
import type { DirectMessage } from './types.mts'
import { admitConversationParticipants } from './participant-admission.mts'
import { conversationMessageInsert } from './conversation-message-insert.mts'

/**
 * First post in a staff-only thread. The caller already found no active participant row.
 * A live owner or moderator is admitted through the cap in the same transaction as the message.
 */
export async function createModInternalMessageForLiveStaff(
  currentUserId: string,
  provenance: ContentProvenance,
  conversationId: string,
  bodyText: string,
  observedTime?: Date | null,
): Promise<DirectMessage | null> {
  const { rows } = await read<{ community_id: string | null }>(
    sql`/* createModInternalMessageForLiveStaff */
      SELECT community_id
      FROM conversations
      WHERE id = ${conversationId}
        AND channel_type = 'mod_internal'
        AND deleted_at IS NULL
      LIMIT 1
    `,
  )
  const communityId = rows[0]?.community_id
  if (!communityId) return null

  await using query = await beginTransaction()
  const live = await userHasLiveCommunityStaffRole(currentUserId, communityId, {
    observedTime,
    query,
  })
  if (!live) return null

  await admitConversationParticipants(query, conversationId, [
    { userId: currentUserId, role: 'admin' },
  ])
  const { rows: messageRows } = await query(
    conversationMessageInsert(currentUserId, provenance, conversationId, bodyText),
  )
  const message = messageRows[0] as DirectMessage | undefined
  if (!message) return null
  await query.commit()
  return message
}
