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
  } catch (err) {
    if (!(err instanceof ApiError)) return { kind: 'unavailable' }
    if (err.status === 401) return { kind: 'unauthenticated' }
    if (err.status === 403) return { kind: 'entitlement-denied' }
    if (err.status === 404) return { kind: 'community-unavailable' }
    return { kind: 'unavailable' }
  }
}
