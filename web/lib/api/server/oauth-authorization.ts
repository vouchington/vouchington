import { cache } from 'react'
import { returnNullForMissingEntity } from '@vouchington/api-client'
import { serverApi } from './instance'
import type { OAuthAuthorizationRequestResponse } from '@/types/oauth-authorization'

export const getOAuthAuthorizationRequest = cache(
  async (requestId: string): Promise<OAuthAuthorizationRequestResponse | null> =>
    returnNullForMissingEntity(
      serverApi.get<OAuthAuthorizationRequestResponse>(
        `/api/v1/oauth/authorization-requests/${encodeURIComponent(requestId)}`,
      ),
    ),
)
