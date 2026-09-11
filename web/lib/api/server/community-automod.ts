import { cache } from 'react'
import { serverApi } from './instance'
import type { CommunityAutomodActionsResponseBody } from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getCommunityAutomodRecentActions = cache(
  async (
    idOrSlug: string,
    options: GetOptions = {},
  ): Promise<CommunityAutomodActionsResponseBody> => {
    return serverApi.get<CommunityAutomodActionsResponseBody>(
      `/api/v1/communities/${idOrSlug}/automod/recent-actions`,
      options,
    )
  },
)
