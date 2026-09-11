import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { ChatConversationsResponseBody, ChatMessagesResponseBody } from '@/types/chat'

export const getMyConversations = cache(
  async (options?: {
    after?: string
    limit?: number
    headers?: Record<string, string>
  }): Promise<ChatConversationsResponseBody> => {
    const searchParams: Record<string, string> = {}
    if (options?.after) searchParams.after = options.after
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()

    return serverApi.get<ChatConversationsResponseBody>('/api/v1/my/conversations', {
      headers: options?.headers,
      ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
    })
  },
)

export const getMyConversationMessages = cache(
  async (
    conversationId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<ChatMessagesResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<ChatMessagesResponseBody>(
        `/api/v1/my/conversations/${conversationId}/messages`,
        options,
      ),
    )
  },
)
