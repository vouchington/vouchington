'use client'

import { clientApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type {
  AdminOAuthClient,
  AdminOAuthClientListItem,
  OAuthClientVerificationFilter,
} from '@/types/oauth-apps'

export function fetchAdminOAuthClients(options: {
  verification: OAuthClientVerificationFilter
  after?: string
  limit?: number
}): Promise<ListResponse<AdminOAuthClientListItem>> {
  return clientApi.get<ListResponse<AdminOAuthClientListItem>>('/api/v1/admin/oauth-clients', {
    searchParams: options,
  })
}

/**
 * Verifies the client under the exact name and redirect URIs staff reviewed; an owner's change to
 * either since the review is a conflict.
 */
export function verifyOAuthClient(
  id: string,
  reviewed: Pick<AdminOAuthClient, 'client_name' | 'redirect_uris'>,
): Promise<{ oauth_client: AdminOAuthClient }> {
  return clientApi.put<{ oauth_client: AdminOAuthClient }>(
    `/api/v1/admin/oauth-clients/${encodeURIComponent(id)}/verification`,
    { client_name: reviewed.client_name, redirect_uris: reviewed.redirect_uris },
  )
}

export function unverifyOAuthClient(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/admin/oauth-clients/${encodeURIComponent(id)}/verification`)
}
