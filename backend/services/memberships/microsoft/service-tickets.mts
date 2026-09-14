import { getExternalFetch } from '@modules/utils'
import type { MicrosoftStoreServiceTickets } from './types.mts'

const TENANT_TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`
const COLLECTIONS_SCOPE = 'https://onestore.microsoft.com/b2b/keys/create/collections/.default'
const PURCHASE_SCOPE = 'https://onestore.microsoft.com/b2b/keys/create/purchase/.default'

export async function createMicrosoftStoreServiceTickets(options: {
  userId: string
  config?: { tenantId: string; clientId: string; clientSecret: string }
  fetch?: typeof fetch
}): Promise<MicrosoftStoreServiceTickets> {
  const config = options.config ?? microsoftStoreServiceConfig()
  const providerFetch = options.fetch ?? getExternalFetch()
  const [collections, purchase] = await Promise.all([
    requestTicket(providerFetch, config, COLLECTIONS_SCOPE),
    requestTicket(providerFetch, config, PURCHASE_SCOPE),
  ])
  return {
    publisher_user_id: options.userId,
    collections_service_ticket: collections.token,
    purchase_service_ticket: purchase.token,
    expires_at: new Date(Math.min(collections.expiresAt, purchase.expiresAt)),
  }
}

async function requestTicket(
  fetcher: typeof fetch,
  config: { tenantId: string; clientId: string; clientSecret: string },
  resource: string,
) {
  /* no-mistakes: integration=microsoft-store */
  const response = await fetcher(TENANT_TOKEN_URL(config.tenantId), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: resource,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok)
    throw new Error(`Microsoft Store service-ticket request failed with ${response.status}`)
  const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
  if (
    typeof payload.access_token !== 'string' ||
    typeof payload.expires_in !== 'number' ||
    payload.expires_in <= 60
  )
    throw new Error('Microsoft Store service-ticket response is malformed')
  return { token: payload.access_token, expiresAt: Date.now() + (payload.expires_in - 60) * 1000 }
}
function microsoftStoreServiceConfig() {
  const tenantId = required('MICROSOFT_STORE_TENANT_ID')
  return {
    tenantId,
    clientId: required('MICROSOFT_STORE_CLIENT_ID'),
    clientSecret: required('MICROSOFT_STORE_CLIENT_SECRET'),
  }
}
function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Microsoft Store membership verification`)
  return value
}
