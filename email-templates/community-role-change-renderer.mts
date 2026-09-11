import Template from './community-role-change.tsx'
import type { CommunityRoleChangeEmailProps, EmailRenderResultPromise } from './types.mts'

export function renderCommunityRoleChangeEmail(
  props: CommunityRoleChangeEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
