import { cache } from 'react'
import { serverApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { OAuthApp } from '@/types/oauth-apps'

export const getMyOAuthApps = cache(
  async (options?: { after?: string; limit?: number }): Promise<ListResponse<OAuthApp>> =>
    serverApi.get<ListResponse<OAuthApp>>('/api/v1/my/oauth-apps', {
      searchParams: { after: options?.after, limit: options?.limit },
    }),
)
