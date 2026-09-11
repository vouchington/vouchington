import Template from './welcome.tsx'
import type { EmailRenderResultPromise, WelcomeEmailProps } from './types.mts'
export function renderWelcomeEmail(props: WelcomeEmailProps): EmailRenderResultPromise {
  return Template.render(props)
}
