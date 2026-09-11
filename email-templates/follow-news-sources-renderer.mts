import Template from './follow-news-sources.tsx'
import type { EmailRenderResultPromise, FollowNewsSourcesEmailProps } from './types.mts'
export function renderFollowNewsSourcesEmail(
  props: FollowNewsSourcesEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
