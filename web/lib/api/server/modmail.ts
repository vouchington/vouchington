import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  ModmailInboxResponseBody,
  ModmailMessagesResponseBody,
  ModmailThread,
} from '@/lib/api/client/modmail'

export const getModmailInboxServer = cache(
  async (
    communitySlug: string,
    options?: { headers?: Record<string, string> },
  ): Promise<ModmailInboxResponseBody> => {
    return serverApi.get<ModmailInboxResponseBody>(
      `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail`,
      options,
    )
  },
)

export const getModmailThreadServer = cache(
  async (
    communitySlug: string,
    threadId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<{ thread: ModmailThread } | null> => {
    return returnNullForMissingEntity(
      serverApi.get(
        `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail/${threadId}`,
        options,
      ),
    )
  },
)

export const getModmailThreadMessagesServer = cache(
  async (
    communitySlug: string,
    threadId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<ModmailMessagesResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<ModmailMessagesResponseBody>(
        `/api/v1/communities/${encodeURIComponent(communitySlug)}/modmail/${threadId}/messages`,
        options,
      ),
    )
  },
)
