import Template from './api-key-expiry.tsx'
import type { ApiKeyExpiryEmailProps, EmailRenderResultPromise } from './types.mts'

export function renderApiKeyExpiryEmail(props: ApiKeyExpiryEmailProps): EmailRenderResultPromise {
  return Template.render(props)
}
