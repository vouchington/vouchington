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

export interface CommunityBanLiftResult {
  community_id: string
  user_id: string
  lifted_ban_ids: string[]
}

export function liftBan(idOrSlug: string, banId: string): Promise<CommunityBanLiftResult> {
  return clientApi.delete(`/api/v1/communities/${idOrSlug}/bans/${banId}`)
}

export function liftAllBans(idOrSlug: string, userId: string): Promise<CommunityBanLiftResult> {
  return clientApi.delete(`/api/v1/communities/${idOrSlug}/bans/users/${userId}`)
}

export function fetchCommunityBan(
  idOrSlug: string,
  banId: string,
): Promise<{ community_ban: CommunityBan }> {
  return clientApi.get(`/api/v1/communities/${idOrSlug}/bans/${banId}`)
}

export function fetchActiveCommunityBans(
  idOrSlug: string,
  userId: string,
  after?: string,
): Promise<CommunityBansResponseBody> {
  return clientApi.get(`/api/v1/communities/${idOrSlug}/bans/users/${userId}`, {
    searchParams: { after },
  })
}

export function fetchCommunityBans(
  idOrSlug: string,
  after?: string,
): Promise<CommunityBansResponseBody> {
  return clientApi.get<CommunityBansResponseBody>(`/api/v1/communities/${idOrSlug}/bans`, {
    searchParams: { after },
  })
}
