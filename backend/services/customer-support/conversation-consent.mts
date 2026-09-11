import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function isConversationLinkedToSupportThread(
  conversationId: string,
  conversationOwnerId: string | null,
): Promise<boolean> {
  // Lag-sensitive authorization check: a newly linked support thread must grant
  // admin access immediately after the writer commits.
  const { rows } = await write(sql`/* isConversationLinkedToSupportThread */
    SELECT 1
    FROM support_threads st
    JOIN support_contacts sc ON sc.id = st.support_contact_id
    WHERE st.conversation_id = ${conversationId}
      AND sc.user_id = ${conversationOwnerId}
    LIMIT 1
  `)
  return rows.length > 0
}
