'use client'

import { clientApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { OAuthGrant } from '@/types/oauth-apps'

export function getOAuthGrants(options: {
  after?: string
  limit?: number
}): Promise<ListResponse<OAuthGrant>> {
  return clientApi.get<ListResponse<OAuthGrant>>('/api/v1/my/oauth-grants', {
    searchParams: options,
  })
}

/** Disconnects the app: its tokens for this user stop working. */
export function revokeOAuthGrant(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/oauth-grants/${encodeURIComponent(id)}`)
}
