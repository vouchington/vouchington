import { createHash } from 'node:crypto'
import { getExternalFetch } from '@modules/utils'

const SERVICE_SCOPE = 'https://onestore.microsoft.com/.default'
const cachedServiceTokens = new Map<string, { value: string; expiresAt: number }>()
const inFlightServiceTokenRefreshes = new Map<string, Promise<string>>()

export async function getMicrosoftStoreServiceToken(config: {
  tenantId: string
  clientId: string
  clientSecret: string
}): Promise<string> {
  const cacheKey = serviceTokenCacheKey(config)
  const cachedServiceToken = cachedServiceTokens.get(cacheKey)
  if (cachedServiceToken && cachedServiceToken.expiresAt > Date.now() + 60_000)
    return cachedServiceToken.value
  const inFlightRefresh = inFlightServiceTokenRefreshes.get(cacheKey)
  if (inFlightRefresh) return inFlightRefresh
  const refresh = refreshMicrosoftStoreServiceToken(config, cacheKey)
  inFlightServiceTokenRefreshes.set(cacheKey, refresh)
  try {
    return await refresh
  } finally {
    if (inFlightServiceTokenRefreshes.get(cacheKey) === refresh)
      inFlightServiceTokenRefreshes.delete(cacheKey)
  }
}

async function refreshMicrosoftStoreServiceToken(
  config: Parameters<typeof getMicrosoftStoreServiceToken>[0],
  cacheKey: string,
): Promise<string> {
  /* no-mistakes: integration=microsoft-store */
  const response = await getExternalFetch()(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: SERVICE_SCOPE,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!response.ok)
    throw new Error(`Microsoft Store service token request failed with ${response.status}`)
  const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
  if (typeof payload.access_token !== 'string' || typeof payload.expires_in !== 'number')
    throw new Error('Microsoft Store service token response is malformed')
  const serviceToken = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  }
  cachedServiceTokens.set(cacheKey, serviceToken)
  return serviceToken.value
}

function serviceTokenCacheKey(config: Parameters<typeof getMicrosoftStoreServiceToken>[0]): string {
  return createHash('sha256')
    .update(`${config.tenantId}\u0000${config.clientId}\u0000${config.clientSecret}`)
    .digest('hex')
}
