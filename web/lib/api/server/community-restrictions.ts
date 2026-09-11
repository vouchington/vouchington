import { cache } from 'react'
import { serverApi } from './instance'
import type { CommunityRestrictionsResponseBody } from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getCommunityRestrictions = cache(
  async (
    idOrSlug: string,
    options: GetOptions = {},
  ): Promise<CommunityRestrictionsResponseBody> => {
    return serverApi.get<CommunityRestrictionsResponseBody>(
      `/api/v1/communities/${idOrSlug}/restrictions`,
      options,
    )
  },
)
