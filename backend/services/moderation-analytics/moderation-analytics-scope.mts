import type { ModerationAnalyticsScope } from './types.mts'

export function getCommunityId(scope: ModerationAnalyticsScope): string | null {
  return scope.type === 'community' ? scope.communityId : null
}
