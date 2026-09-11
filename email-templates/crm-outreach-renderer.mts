import Template from './crm-outreach.tsx'
import type { CrmOutreachEmailProps, EmailRenderResultPromise } from './types.mts'
export function renderCrmOutreachEmail(props: CrmOutreachEmailProps): EmailRenderResultPromise {
  return Template.render(props)
}
