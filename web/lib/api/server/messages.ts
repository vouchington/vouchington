import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  DirectConversation,
  DirectConversationsResponse,
  DirectMessagesResponse,
  DirectMessageParticipant,
} from '@/types/messages'

export const getMyMessages = cache(
  async (options?: { headers?: Record<string, string> }): Promise<DirectConversationsResponse> => {
    return serverApi.get<DirectConversationsResponse>('/api/v1/my/messages', options)
  },
)

export const getConversationParticipants = cache(
  async (
    conversationId: string,
    options?: { headers?: Record<string, string>; after?: string; limit?: number },
  ): Promise<{
    results: DirectMessageParticipant[]
    page_info: { has_next_page: boolean; end_cursor: string | null }
  } | null> => {
    const requestOptions =
      options?.after !== undefined || options?.limit !== undefined
        ? {
            headers: options.headers,
            searchParams: { after: options.after, limit: options.limit },
          }
        : options
    return returnNullForMissingEntity(
      serverApi.get<{
        results: DirectMessageParticipant[]
        page_info: { has_next_page: boolean; end_cursor: string | null }
      }>(`/api/v1/my/messages/${conversationId}/participants`, requestOptions),
    )
  },
)

export const getConversation = cache(
  async (
    conversationId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<DirectConversation | null> => {
    return returnNullForMissingEntity(
      serverApi
        .get<{ conversation: DirectConversation }>(`/api/v1/my/messages/${conversationId}`, options)
        .then(r => r.conversation),
    )
  },
)

export const getMyMessageThread = cache(
  async (
    conversationId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<DirectMessagesResponse | null> => {
    return returnNullForMissingEntity(
      serverApi.get<DirectMessagesResponse>(
        `/api/v1/my/messages/${conversationId}/messages`,
        options,
      ),
    )
  },
)
