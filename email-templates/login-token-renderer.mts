import Template from './login-token.tsx'
import type { EmailRenderResultPromise, LoginTokenEmailProps } from './types.mts'
export function renderLoginTokenEmail(props: LoginTokenEmailProps): EmailRenderResultPromise {
  return Template.render(props)
}
