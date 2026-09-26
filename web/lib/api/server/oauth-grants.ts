import { cache } from 'react'
import { serverApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { OAuthGrant } from '@/types/oauth-apps'

export const getMyOAuthGrants = cache(
  async (options?: { after?: string; limit?: number }): Promise<ListResponse<OAuthGrant>> =>
    serverApi.get<ListResponse<OAuthGrant>>('/api/v1/my/oauth-grants', {
      searchParams: { after: options?.after, limit: options?.limit },
    }),
)
