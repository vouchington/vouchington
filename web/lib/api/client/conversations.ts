'use client'

import { clientApi } from './instance'
import type {
  ChatConversation,
  ChatConversationsResponseBody,
  ChatConversationResponseBody,
  ChatMessagesResponseBody,
} from '@/types/chat'

export function getMyConversationsClient(options?: {
  after?: string
  limit?: number
}): Promise<ChatConversationsResponseBody> {
  const searchParams: Record<string, string | number | boolean | undefined> = {}
  if (options?.after) searchParams.after = options.after
  if (options?.limit !== undefined) searchParams.limit = options.limit
  return clientApi.get<ChatConversationsResponseBody>('/api/v1/my/conversations', { searchParams })
}

export function createConversation(body: {
  title?: string
}): Promise<{ conversation: ChatConversation }> {
  return clientApi.post<{ conversation: ChatConversation }>('/api/v1/conversations', body)
}

export function getConversationMessages(conversationId: string): Promise<ChatMessagesResponseBody> {
  return clientApi.get<ChatMessagesResponseBody>(
    `/api/v1/my/conversations/${conversationId}/messages`,
  )
}

export function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<ChatConversationResponseBody> {
  return clientApi.patch<ChatConversationResponseBody>(
    `/api/v1/my/conversations/${conversationId}`,
    { title },
  )
}

export function generateConversationTitle(
  conversationId: string,
): Promise<ChatConversationResponseBody> {
  return clientApi.post<ChatConversationResponseBody>(
    `/api/v1/my/conversations/${conversationId}/title`,
  )
}

export function deleteConversation(conversationId: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/conversations/${conversationId}`)
}
