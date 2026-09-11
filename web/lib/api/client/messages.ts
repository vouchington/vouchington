'use client'

import { clientApi } from './instance'
import type {
  DirectConversation,
  DirectConversationsResponse,
  DirectMessagesResponse,
  DirectMessageParticipant,
} from '@/types/messages'

export function createDirectConversation(
  userIds: string[],
): Promise<{ conversation: DirectConversation }> {
  return clientApi.post<{ conversation: DirectConversation }>('/api/v1/my/messages', {
    user_ids: userIds,
  })
}

export function addConversationParticipant(
  conversationId: string,
  userId: string,
): Promise<{ participant: DirectMessageParticipant }> {
  return clientApi.post<{ participant: DirectMessageParticipant }>(
    `/api/v1/my/messages/${conversationId}/participants`,
    { user_id: userId },
  )
}

export function removeConversationParticipant(
  conversationId: string,
  userId: string,
): Promise<void> {
  return clientApi.delete<void>(`/api/v1/my/messages/${conversationId}/participants/${userId}`)
}

export function updateConversationParticipantPolicy(
  conversationId: string,
  policy: 'owner_only' | 'all_members',
): Promise<{ participant_add_policy: 'owner_only' | 'all_members' }> {
  return clientApi.patch<{ participant_add_policy: 'owner_only' | 'all_members' }>(
    `/api/v1/my/messages/${conversationId}`,
    { participant_add_policy: policy },
  )
}

export function getMyMessagesClient(
  after?: string,
  limit = 50,
): Promise<DirectConversationsResponse> {
  return clientApi.get<DirectConversationsResponse>('/api/v1/my/messages', {
    searchParams: { limit, after },
  })
}

export function getDirectMessageThreadClient(
  conversationId: string,
  options?: { after?: string; limit?: number },
): Promise<DirectMessagesResponse> {
  return clientApi.get<DirectMessagesResponse>(`/api/v1/my/messages/${conversationId}/messages`, {
    searchParams: { limit: options?.limit ?? 50, after: options?.after },
  })
}

export function sendDirectMessage(
  conversationId: string,
  text: string,
): Promise<{
  message: { id: string; conversation_id: string; body_text: string; created_at: string }
}> {
  return clientApi.post<{
    message: { id: string; conversation_id: string; body_text: string; created_at: string }
  }>(`/api/v1/my/messages/${conversationId}/messages`, { text })
}

export function getConversationParticipantsClient(
  conversationId: string,
  options?: { after?: string; limit?: number },
): Promise<{
  results: DirectMessageParticipant[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}> {
  const path = `/api/v1/my/messages/${conversationId}/participants`
  if (!options) {
    return clientApi.get<{
      results: DirectMessageParticipant[]
      page_info: { has_next_page: boolean; end_cursor: string | null }
    }>(path)
  }
  return clientApi.get<{
    results: DirectMessageParticipant[]
    page_info: { has_next_page: boolean; end_cursor: string | null }
  }>(path, {
    searchParams: { after: options?.after, limit: options?.limit },
  })
}
