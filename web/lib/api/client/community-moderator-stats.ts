'use client'

import { clientApi } from './instance'
import type { CommunityModeratorStatsResponseBody } from '@/types/api-responses'

export function fetchCommunityModeratorStats(
  idOrSlug: string,
  window: 30 | 90 = 30,
): Promise<CommunityModeratorStatsResponseBody> {
  return clientApi.get<CommunityModeratorStatsResponseBody>(
    `/api/v1/communities/${idOrSlug}/moderator-stats`,
    { searchParams: { window: String(window) } },
  )
}
