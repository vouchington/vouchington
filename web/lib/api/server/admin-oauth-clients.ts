import { cache } from 'react'
import { serverApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { AdminOAuthClientListItem, OAuthClientVerificationFilter } from '@/types/oauth-apps'

export const getAdminOAuthClients = cache(
  async (options: {
    verification: OAuthClientVerificationFilter
    after?: string
    limit?: number
  }): Promise<ListResponse<AdminOAuthClientListItem>> =>
    serverApi.get<ListResponse<AdminOAuthClientListItem>>('/api/v1/admin/oauth-clients', {
      searchParams: {
        verification: options.verification,
        after: options.after,
        limit: options.limit,
      },
    }),
)
