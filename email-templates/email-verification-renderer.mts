import Template from './email-verification.tsx'
import type { EmailRenderResultPromise, EmailVerificationEmailProps } from './types.mts'
export function renderEmailVerificationEmail(
  props: EmailVerificationEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
