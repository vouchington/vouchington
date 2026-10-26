import { ValkeyCache } from '@data-stores/valkey/cache'
import { fetchWithTimeoutSimple } from '@modules/utils'
import type { GoogleOidcPublicJwk, GoogleOidcTrustMaterial } from './types.mts'

export type GoogleOidcCachedKeys = {
  keysById: Record<string, GoogleOidcPublicJwk>
  expiresAt: Date
}
export type GoogleOidcTrustStore = {
  load(): Promise<GoogleOidcCachedKeys | null>
  save(value: GoogleOidcCachedKeys): Promise<void>
}

const GOOGLE_OIDC_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const googleOidcTrustCache = new ValkeyCache<{ key: string }>({
  prefix: 'memberships-google-oidc-trust',
  ttlSeconds: 6 * 60 * 60,
  keySerializer: value => value.key,
})

export const googleOidcValkeyTrustStore: GoogleOidcTrustStore = {
  async load() {
    const value = (await googleOidcTrustCache.get({ key: 'current' })) as {
      keysById: Record<string, GoogleOidcPublicJwk>
      expiresAt: string | Date
    } | null
    return value ? { keysById: value.keysById, expiresAt: new Date(value.expiresAt) } : null
  },
  async save(value) {
    await googleOidcTrustCache.set(
      { key: 'current' },
      {
        ...value,
        expiresAt: value.expiresAt.toISOString(),
      },
    )
  },
}

export async function refreshConfiguredGoogleOidcTrustMaterial(): Promise<GoogleOidcCachedKeys> {
  return refreshGoogleOidcTrustMaterial({
    jwksUrl: GOOGLE_OIDC_JWKS_URL,
    store: googleOidcValkeyTrustStore,
  })
}

/** Worker-only refresh. Request handlers receive a previously cached trust snapshot and never call this. */
export async function refreshGoogleOidcTrustMaterial(options: {
  jwksUrl: string
  store: GoogleOidcTrustStore
  cacheTtlMs?: number
  fetchJwks?: (url: string, timeoutMs: number) => Promise<Response>
}): Promise<GoogleOidcCachedKeys> {
  /* no-mistakes: integration=google-oidc */
  const response = await (options.fetchJwks ?? fetchWithTimeoutSimple)(options.jwksUrl, 10_000)
  if (!response.ok) throw new Error(`Google OIDC JWKS refresh failed with ${response.status}`)
  const body = await response.json()
  if (!body || typeof body !== 'object' || !Array.isArray((body as { keys?: unknown }).keys))
    throw new Error('Google OIDC JWKS response is malformed')
  const keysById: Record<string, GoogleOidcPublicJwk> = {}
  for (const key of (body as { keys: unknown[] }).keys) {
    if (!key || typeof key !== 'object') continue
    const candidate = key as Partial<GoogleOidcPublicJwk> & { kid?: unknown }
    if (
      typeof candidate.kid === 'string' &&
      candidate.kty === 'RSA' &&
      typeof candidate.n === 'string' &&
      typeof candidate.e === 'string'
    )
      keysById[candidate.kid] = candidate as GoogleOidcPublicJwk
  }
  if (!Object.keys(keysById).length)
    throw new Error('Google OIDC JWKS response has no RSA signing keys')
  const value = {
    keysById,
    expiresAt: new Date(Date.now() + (options.cacheTtlMs ?? 6 * 60 * 60 * 1000)),
  }
  await options.store.save(value)
  return value
}

export async function getCachedGoogleOidcTrustMaterial(options: {
  store: GoogleOidcTrustStore
  issuer: string
  audience: string
  serviceAccountEmail: string
}): Promise<GoogleOidcTrustMaterial | null> {
  const cached = await options.store.load()
  if (!cached || cached.expiresAt <= new Date()) return null
  return {
    issuer: options.issuer,
    audience: options.audience,
    serviceAccountEmail: options.serviceAccountEmail,
    keysById: cached.keysById,
  }
}
