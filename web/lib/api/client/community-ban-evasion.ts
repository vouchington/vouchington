'use client'

import { clientApi } from './instance'

export function confirmCommunityBanEvasion(idOrSlug: string, userId: string): Promise<void> {
  return clientApi.post<void>(
    `/api/v1/communities/${encodeURIComponent(idOrSlug)}/ban-evasion/${encodeURIComponent(userId)}`,
  )
}

export function dismissCommunityBanEvasion(idOrSlug: string, userId: string): Promise<void> {
  return clientApi.delete<void>(
    `/api/v1/communities/${encodeURIComponent(idOrSlug)}/ban-evasion/${encodeURIComponent(userId)}`,
  )
}
