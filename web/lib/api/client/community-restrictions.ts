'use client'

import { clientApi } from './instance'
import type {
  ActivateCommunityRestrictionsResponseBody,
  CommunityRestrictionType,
  CommunityRestrictionsResponseBody,
} from '@/types/api-responses'

interface ActivateCommunityRestrictionsInput {
  restrictionTypes: CommunityRestrictionType[]
  expiresAt: string | null
  reason?: string
}

export function activateCommunityRestrictions(
  idOrSlug: string,
  input: ActivateCommunityRestrictionsInput,
): Promise<ActivateCommunityRestrictionsResponseBody> {
  return clientApi.post<ActivateCommunityRestrictionsResponseBody>(
    `/api/v1/communities/${idOrSlug}/restrictions`,
    {
      restriction_types: input.restrictionTypes,
      expires_at: input.expiresAt,
      reason: input.reason,
    },
  )
}

export function liftCommunityRestriction(idOrSlug: string, restrictionId: string): Promise<void> {
  return clientApi.delete(`/api/v1/communities/${idOrSlug}/restrictions/${restrictionId}`)
}

export function getCommunityRestrictionPage(
  idOrSlug: string,
  options: { status?: 'active' | 'past'; after?: string } = {},
): Promise<CommunityRestrictionsResponseBody> {
  return clientApi.get<CommunityRestrictionsResponseBody>(
    `/api/v1/communities/${idOrSlug}/restrictions`,
    { searchParams: options },
  )
}
