import Template from './community-application-decision.tsx'
import type { CommunityApplicationDecisionEmailProps, EmailRenderResultPromise } from './types.mts'

export function renderCommunityApplicationDecisionEmail(
  props: CommunityApplicationDecisionEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
