import { createHash, createSign } from 'node:crypto'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'
import { getExternalFetch } from '@modules/utils'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_PUBLISHER_BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const GOOGLE_ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
type GooglePlayFetch = ReturnType<typeof getExternalFetch>
const cachedAccessTokens = new Map<string, { value: string; expiresAt: number }>()

export class GooglePlaySubscriptionLookupError extends Error {
  readonly status: number
  readonly purchaseTokenDigest: string
  readonly reason: string | null

  constructor(status: number, purchaseToken: string, reason: string | null = null) {
    super(`Google Play subscriptionsv2 fetch failed with ${status}`)
    this.name = 'GooglePlaySubscriptionLookupError'
    this.status = status
    this.purchaseTokenDigest = createHash('sha256').update(purchaseToken).digest('hex')
    this.reason = reason
  }

  get invalidPurchaseToken(): boolean {
    return (
      this.status === 404 ||
      this.status === 410 ||
      (this.status === 400 &&
        (this.reason === 'invalidValue' ||
          this.reason === 'purchaseTokenMismatch' ||
          this.reason === 'subscriptionExpired'))
    )
  }
}

export function createConfiguredGooglePlaySubscriptionsV2Client(): GooglePlaySubscriptionsV2Client {
  return createGooglePlaySubscriptionsV2Client(
    getGooglePlayServiceAccountConfig(),
    getExternalFetch(),
  )
}

export function createGooglePlaySubscriptionsV2Client(
  config: GooglePlayServiceAccountConfig,
  providerFetch: GooglePlayFetch,
): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription(options) {
      return getGooglePlaySubscription(config, providerFetch, options)
    },
    acknowledgeSubscription(options) {
      return acknowledgeGooglePlaySubscription(config, providerFetch, options)
    },
  }
}

export type GooglePlayServiceAccountConfig = { clientEmail: string; privateKey: string }
export function getGooglePlayServiceAccountConfig(): GooglePlayServiceAccountConfig {
  const clientEmail = requiredEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL')
  const privateKey = requiredEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY').replaceAll('\\n', '\n')
  if (!privateKey.includes('BEGIN PRIVATE KEY'))
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY must be a PEM private key')
  return { clientEmail, privateKey }
}

async function getGooglePlaySubscription(
  config: GooglePlayServiceAccountConfig,
  providerFetch: GooglePlayFetch,
  options: { packageName: string; purchaseToken: string },
): Promise<GooglePlaySubscriptionV2> {
  const token = await getGooglePlayAccessToken(config, providerFetch)
  /* no-mistakes: integration=google-play */
  const response = await providerFetch(
    `${GOOGLE_PUBLISHER_BASE_URL}/applications/${encodeURIComponent(options.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(options.purchaseToken)}`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) },
  )
  if (!response.ok) {
    let reason: string | null = null
    if (response.status === 400) {
      const body: unknown = await response.json().catch(() => null)
      if (body && typeof body === 'object' && 'error' in body) {
        const error: unknown = body.error
        if (
          error &&
          typeof error === 'object' &&
          'errors' in error &&
          Array.isArray(error.errors)
        ) {
          const first: unknown = error.errors[0]
          if (
            first &&
            typeof first === 'object' &&
            'reason' in first &&
            typeof first.reason === 'string'
          )
            reason = first.reason
        }
      }
    }
    throw new GooglePlaySubscriptionLookupError(response.status, options.purchaseToken, reason)
  }
  return (await response.json()) as GooglePlaySubscriptionV2
}

async function acknowledgeGooglePlaySubscription(
  config: GooglePlayServiceAccountConfig,
  providerFetch: GooglePlayFetch,
  options: { packageName: string; subscriptionId: string; purchaseToken: string },
): Promise<void> {
  const token = await getGooglePlayAccessToken(config, providerFetch)
  /* no-mistakes: integration=google-play */
  const response = await providerFetch(
    `${GOOGLE_PUBLISHER_BASE_URL}/applications/${encodeURIComponent(options.packageName)}/purchases/subscriptions/${encodeURIComponent(options.subscriptionId)}/tokens/${encodeURIComponent(options.purchaseToken)}:acknowledge`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!response.ok) throw new Error(`Google Play acknowledgement failed with ${response.status}`)
}

async function getGooglePlayAccessToken(
  config: GooglePlayServiceAccountConfig,
  providerFetch: GooglePlayFetch,
): Promise<string> {
  const cacheKey = createHash('sha256')
    .update(`${config.clientEmail}\u0000${config.privateKey}`)
    .digest('hex')
  const cachedAccessToken = cachedAccessTokens.get(cacheKey)
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000)
    return cachedAccessToken.value
  const now = Math.floor(Date.now() / 1000)
  const assertion = signServiceAccountAssertion(config, now)
  /* no-mistakes: integration=google-oauth */
  const response = await providerFetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Google OAuth token exchange failed with ${response.status}`)
  const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
  if (typeof payload.access_token !== 'string' || typeof payload.expires_in !== 'number')
    throw new Error('Google OAuth token response is malformed')
  const accessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  }
  cachedAccessTokens.set(cacheKey, accessToken)
  return accessToken.value
}

function signServiceAccountAssertion(config: GooglePlayServiceAccountConfig, now: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(
    JSON.stringify({
      iss: config.clientEmail,
      scope: GOOGLE_ANDROID_PUBLISHER_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url')
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  return `${header}.${claims}.${signer.sign(config.privateKey).toString('base64url')}`
}
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Google Play membership verification`)
  return value
}
