import Template from './follow-topics.tsx'
import type { EmailRenderResultPromise, FollowTopicsEmailProps } from './types.mts'
export function renderFollowTopicsEmail(props: FollowTopicsEmailProps): EmailRenderResultPromise {
  return Template.render(props)
}
