'use client'

import { clientApi } from './instance'
import type { AdminOAuthClient } from '@/types/oauth-apps'

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
