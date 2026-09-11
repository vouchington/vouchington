'use client'

import { clientApi } from './instance'
import type { CommunityBan, CommunityBansResponseBody } from '@/types/api-responses'

interface BanMemberInput {
  reason?: string
  expiresAt?: string
}

export function banMember(
  idOrSlug: string,
  userId: string,
  input?: BanMemberInput,
): Promise<{ community_ban: CommunityBan }> {
  return clientApi.post<{ community_ban: CommunityBan }>(`/api/v1/communities/${idOrSlug}/bans`, {
    user_id: userId,
    reason: input?.reason,
    expires_at: input?.expiresAt,
  })
}

export function liftBan(idOrSlug: string, userId: string): Promise<void> {
  return clientApi.delete(`/api/v1/communities/${idOrSlug}/bans/${userId}`)
}

export function fetchCommunityBans(
  idOrSlug: string,
  after?: string,
): Promise<CommunityBansResponseBody> {
  return clientApi.get<CommunityBansResponseBody>(`/api/v1/communities/${idOrSlug}/bans`, {
    searchParams: { after },
  })
}
