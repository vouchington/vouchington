import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  SupportContactsResponse,
  SupportContactDetailResponse,
  SupportMessagesResponse,
  SupportThread,
  SupportThreadsResponse,
  SupportMessage,
} from '@/types/support'

export const getAdminSupportThreads = cache(
  async (options?: {
    status?: 'open' | 'assigned' | 'resolved'
    q?: string
    limit?: number
    after?: string
    headers?: Record<string, string>
  }): Promise<SupportThreadsResponse> => {
    const searchParams: Record<string, string> = {}
    if (options?.status) searchParams.status = options.status
    if (options?.q) searchParams.q = options.q
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    if (options?.after) searchParams.after = options.after

    return serverApi.get<SupportThreadsResponse>('/api/v1/support/threads', {
      headers: options?.headers,
      ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
    })
  },
)

export const getAdminSupportThread = cache(
  async (
    threadId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<{ thread: SupportThread } | null> => {
    return returnNullForMissingEntity(
      serverApi.get<{ thread: SupportThread }>(`/api/v1/support/threads/${threadId}`, options),
    )
  },
)

export const getAdminSupportThreadMessages = cache(
  async (
    threadId: string,
    options?: {
      limit?: number
      after?: string
      headers?: Record<string, string>
    },
  ): Promise<SupportMessagesResponse | null> => {
    const searchParams: Record<string, string> = {}
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    if (options?.after) searchParams.after = options.after

    return returnNullForMissingEntity(
      serverApi.get<SupportMessagesResponse>(`/api/v1/support/threads/${threadId}/messages`, {
        headers: options?.headers,
        ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
      }),
    )
  },
)

export const getAdminSupportContacts = cache(
  async (options?: {
    q?: string
    limit?: number
    after?: string
    headers?: Record<string, string>
  }): Promise<SupportContactsResponse> => {
    const searchParams: Record<string, string> = {}
    if (options?.q) searchParams.q = options.q
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    if (options?.after) searchParams.after = options.after

    return serverApi.get<SupportContactsResponse>('/api/v1/support/contacts', {
      headers: options?.headers,
      ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
    })
  },
)

export const getAdminSupportContact = cache(
  async (
    contactId: string,
    options?: { limit?: number; after?: string; headers?: Record<string, string> },
  ): Promise<SupportContactDetailResponse | null> => {
    const searchParams: Record<string, string> = {}
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    if (options?.after) searchParams.after = options.after

    return returnNullForMissingEntity(
      serverApi.get<SupportContactDetailResponse>(`/api/v1/support/contacts/${contactId}`, {
        headers: options?.headers,
        ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
      }),
    )
  },
)

export const getMySupportThreads = cache(
  async (options?: {
    limit?: number
    after?: string
    headers?: Record<string, string>
  }): Promise<SupportThreadsResponse> => {
    const searchParams: Record<string, string> = {}
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    if (options?.after) searchParams.after = options.after

    return serverApi.get<SupportThreadsResponse>('/api/v1/my/support-threads', {
      headers: options?.headers,
      ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
    })
  },
)

export const getMySupportThread = cache(
  async (
    threadId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<{ thread: SupportThread; messages: SupportMessage[] } | null> => {
    return returnNullForMissingEntity(
      serverApi.get<{ thread: SupportThread; messages: SupportMessage[] }>(
        `/api/v1/my/support-threads/${threadId}`,
        options,
      ),
    )
  },
)
