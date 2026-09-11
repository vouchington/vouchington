import Template from './support-reply.tsx'
import type { EmailRenderResultPromise, SupportReplyEmailProps } from './types.mts'

export function renderSupportReplyEmail(props: SupportReplyEmailProps): EmailRenderResultPromise {
  return Template.render(props)
}
