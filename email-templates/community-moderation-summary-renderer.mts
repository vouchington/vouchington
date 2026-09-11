import Template from './community-moderation-summary.tsx'
import type { CommunityModerationSummaryEmailProps, EmailRenderResultPromise } from './types.mts'
export function renderCommunityModerationSummaryEmail(
  props: CommunityModerationSummaryEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
