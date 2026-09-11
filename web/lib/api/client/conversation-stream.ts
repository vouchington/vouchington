'use client'

import { clientFetch } from './raw-fetch'

export function sendConversationChatStream(
  conversationId: string,
  message: string,
  signal: AbortSignal,
): Promise<Response> {
  return clientFetch(`/api/v1/conversations/${conversationId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message }),
    signal,
  })
}
