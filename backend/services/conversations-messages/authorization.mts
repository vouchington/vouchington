import type { PrivateUser } from '@services/users/types'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Conversation } from './types.mts'

export async function currentUserCanViewConversation(
  currentUser: PrivateUser | null,
  conversation: Conversation,
): Promise<boolean> {
  if (!currentUser) return false
  if (conversation.channel_type !== 'chat') return false
  if (conversation.created_by_id === currentUser.id) return true
  if (!currentUser.roles.includes('administrator')) return false
  return isConversationLinkedToSupportThread(conversation.id, conversation.created_by_id)
}

export async function currentUserCanUpdateConversation(
  currentUser: PrivateUser | null,
  conversation: Conversation,
): Promise<boolean> {
  if (!currentUser) return false
  if (conversation.channel_type !== 'chat') return false
  if (conversation.created_by_id === currentUser.id) return true
  if (!currentUser.roles.includes('administrator')) return false
  return isConversationLinkedToSupportThread(conversation.id, conversation.created_by_id)
}

export async function currentUserCanDeleteConversation(
  currentUser: PrivateUser | null,
  conversation: Conversation,
): Promise<boolean> {
  if (!currentUser) return false
  if (conversation.channel_type !== 'chat') return false
  if (conversation.created_by_id === currentUser.id) return true
  if (!currentUser.roles.includes('administrator')) return false
  return isConversationLinkedToSupportThread(conversation.id, conversation.created_by_id)
}

async function isConversationLinkedToSupportThread(
  conversationId: string,
  conversationOwnerId: string | null,
): Promise<boolean> {
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
