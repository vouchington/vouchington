import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function addModParticipants(
  query: TransactionQuery,
  conversationId: string,
  communityId: string,
  observedTime: Date | null,
): Promise<void> {
  const { rows: modRows } = await query(sql`/* openModInternalThread:mods */
    SELECT cm.user_id
    FROM community_members cm
    WHERE cm.community_id = ${communityId}
      AND cm.role IN ('owner', 'moderator')
      AND cm.removed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM community_member_vacations v
        WHERE v.community_id = cm.community_id
          AND v.user_id      = cm.user_id
          AND v.starts_at   <= COALESCE(${observedTime}::timestamptz, now())
          AND (v.ends_at IS NULL OR v.ends_at > COALESCE(${observedTime}::timestamptz, now()))
      )
  `)

  if (modRows.length === 0) return

  const typedModRows = modRows as Array<{ user_id: string }>
  await query(sql`/* openModInternalThread:modParticipants */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT ${conversationId}::uuid AS conversation_id, user_id, 'admin'
    FROM unnest(${typedModRows.map(row => row.user_id)}::uuid[]) AS input(user_id)
    ORDER BY conversation_id ASC NULLS LAST, user_id ASC NULLS LAST
    ON CONFLICT (conversation_id, user_id) WHERE (user_id IS NOT NULL) AND (removed_at IS NULL)
    DO NOTHING
  `)
}
