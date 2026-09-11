import Template from './post-referral-link.tsx'
import type { EmailRenderResultPromise, PostReferralLinkEmailProps } from './types.mts'
export function renderPostReferralLinkEmail(
  props: PostReferralLinkEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
