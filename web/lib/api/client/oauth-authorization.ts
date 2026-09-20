'use client'

import { clientApi } from './instance'
import type { OAuthAuthorizationDecisionResponse } from '@/types/oauth-authorization'

export function decideOAuthAuthorizationRequest(
  requestId: string,
  decision: 'approve' | 'deny',
): Promise<OAuthAuthorizationDecisionResponse> {
  return clientApi.post<OAuthAuthorizationDecisionResponse>(
    `/api/v1/oauth/authorization-requests/${encodeURIComponent(requestId)}/decisions`,
    { decision },
  )
}
