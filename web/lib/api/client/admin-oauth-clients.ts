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

/** Verifies the client under the exact name staff reviewed; a renamed client is a conflict. */
export function verifyOAuthClient(
  id: string,
  clientName: string,
): Promise<{ oauth_client: AdminOAuthClient }> {
  return clientApi.put<{ oauth_client: AdminOAuthClient }>(
    `/api/v1/admin/oauth-clients/${encodeURIComponent(id)}/verification`,
    { client_name: clientName },
  )
}

export function unverifyOAuthClient(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/admin/oauth-clients/${encodeURIComponent(id)}/verification`)
}
