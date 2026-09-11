import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getAgents = cache(async <T>(options: GetOptions = {}): Promise<T> => {
  return serverApi.get<T>('/api/v1/agents', options)
})

export const getAgent = cache(
  async <T>(idOrSlug: string, options?: GetOptions): Promise<T | null> => {
    return returnNullForMissingEntity(serverApi.get<T>(`/api/v1/agents/${idOrSlug}`, options))
  },
)

export const getAgentConversations = cache(
  async <T>(idOrSlug: string, options: GetOptions = {}): Promise<T> => {
    return serverApi.get<T>(`/api/v1/agents/${idOrSlug}/conversations`, options)
  },
)

export const getAgentConversation = cache(
  async <T>(
    idOrSlug: string,
    conversationId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<T | null> => {
    return returnNullForMissingEntity(
      serverApi.get<T>(`/api/v1/agents/${idOrSlug}/conversations/${conversationId}`, options),
    )
  },
)
