import Template from './community-invite.tsx'
import type { CommunityInviteEmailProps, EmailRenderResultPromise } from './types.mts'
export function renderCommunityInviteEmail(
  props: CommunityInviteEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
