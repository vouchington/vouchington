'use client'

import { clientApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type {
  CreateOAuthAppInput,
  IssuedOAuthApp,
  OAuthApp,
  UpdateOAuthAppInput,
} from '@/types/oauth-apps'

export function getOAuthApps(options: {
  after?: string
  limit?: number
}): Promise<ListResponse<OAuthApp>> {
  return clientApi.get<ListResponse<OAuthApp>>('/api/v1/my/oauth-apps', { searchParams: options })
}

export function createOAuthApp(input: CreateOAuthAppInput): Promise<IssuedOAuthApp> {
  return clientApi.post<IssuedOAuthApp>('/api/v1/my/oauth-apps', input)
}

export function updateOAuthApp(
  id: string,
  changes: UpdateOAuthAppInput,
): Promise<{ oauth_app: OAuthApp }> {
  return clientApi.patch<{ oauth_app: OAuthApp }>(
    `/api/v1/my/oauth-apps/${encodeURIComponent(id)}`,
    changes,
  )
}

export function revokeOAuthApp(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/oauth-apps/${encodeURIComponent(id)}`)
}

/** Replaces the app's client secret; the previous secret stops working immediately. */
export function rotateOAuthAppSecret(id: string): Promise<IssuedOAuthApp> {
  return clientApi.post<IssuedOAuthApp>(
    `/api/v1/my/oauth-apps/${encodeURIComponent(id)}/client-secrets`,
  )
}
