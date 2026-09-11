'use client'

import { clientApi } from './instance'
import type {
  ModeratorVacationDigestPreferenceResponseBody,
  ModeratorVacationResponseBody,
} from '@/types/api-responses'

export function fetchMyModeratorVacation(
  communitySlug: string,
): Promise<ModeratorVacationResponseBody> {
  return clientApi.get<ModeratorVacationResponseBody>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/moderator-vacation`,
  )
}

export function setMyModeratorVacation(
  communitySlug: string,
  options: { endsAt?: string | null } = {},
): Promise<ModeratorVacationResponseBody> {
  return clientApi.put<ModeratorVacationResponseBody>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/moderator-vacation`,
    { ends_at: options.endsAt ?? null },
  )
}

export function clearMyModeratorVacation(communitySlug: string): Promise<void> {
  return clientApi.delete(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/moderator-vacation`,
  )
}

export function setSuppressCommunityDigestsWhileOnVacation(
  communitySlug: string,
  suppress: boolean,
): Promise<ModeratorVacationDigestPreferenceResponseBody> {
  return clientApi.patch<ModeratorVacationDigestPreferenceResponseBody>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/moderator-vacation`,
    { suppress_community_digests_while_on_vacation: suppress },
  )
}
