import type { PrivateUser } from '@services/users/types'
import type { Conversation } from './types.mts'

export async function currentUserCanViewConversation(
  currentUser: PrivateUser | null,
  conversation: Conversation,
): Promise<boolean> {
  if (!currentUser) return false
  if (conversation.channel_type !== 'chat') return false
  if (conversation.created_by_id === currentUser.id) return true
  return false
}

export async function currentUserCanUpdateConversation(
  currentUser: PrivateUser | null,
  conversation: Conversation,
): Promise<boolean> {
  if (!currentUser) return false
  if (conversation.channel_type !== 'chat') return false
  if (conversation.created_by_id === currentUser.id) return true
  return false
}

export async function currentUserCanDeleteConversation(
  currentUser: PrivateUser | null,
  conversation: Conversation,
): Promise<boolean> {
  if (!currentUser) return false
  if (conversation.channel_type !== 'chat') return false
  if (conversation.created_by_id === currentUser.id) return true
  return false
}
