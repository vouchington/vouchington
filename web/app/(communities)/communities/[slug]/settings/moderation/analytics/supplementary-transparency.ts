import { getCommunityModerationTransparency } from '@/lib/api/server'
import { ApiError } from '@/lib/api/error'
import type { ModerationAnalyticsRange, ModerationTransparency } from '@/types/moderation-analytics'

type SupplementaryTransparency =
  | { kind: 'available'; transparency: ModerationTransparency }
  | { kind: 'unauthenticated' }
  | { kind: 'entitlement-denied' }
  | { kind: 'community-unavailable' }
  | { kind: 'unavailable' }

export async function getSupplementaryTransparency(
  slug: string,
  range: ModerationAnalyticsRange,
): Promise<SupplementaryTransparency> {
  try {
    return {
      kind: 'available',
      transparency: await getCommunityModerationTransparency(slug, { range }),
    }
  } catch (error) {
    if (!(error instanceof ApiError)) return { kind: 'unavailable' }
    if (error.status === 401) return { kind: 'unauthenticated' }
    if (error.status === 403) return { kind: 'entitlement-denied' }
    if (error.status === 404) return { kind: 'community-unavailable' }
    return { kind: 'unavailable' }
  }
}
