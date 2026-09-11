import { createPublicKey, createVerify } from 'node:crypto'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { GOOGLE_CLIENT_ID } from '@voucha/config'
import {
  upsertOAuthAccount,
  getOAuthAccountByProviderUserId,
  type OAuthAccount,
} from '@services/oauth-accounts'
import { decodeJwtPart } from '@services/oauth-accounts/jwt'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

type GoogleJWTPayload = {
  iss: string
  azp?: string
  aud: string
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  given_name?: string
  family_name?: string
  iat: number
  exp: number
}

type GooglePublicKey = {
  kid: string
  n: string
  e: string
  kty: string
  alg: string
  use: string
}

type GooglePublicKeys = {
  keys: GooglePublicKey[]
}

let googleKeysPromise: Promise<GooglePublicKeys> | null = null
let googleKeysCachedAt = 0
const GOOGLE_KEYS_CACHE_TTL = 60 * 60 * 1000 // 1 hour

/* no-mistakes: integration=oauth */
function fetchGooglePublicKeys(): Promise<GooglePublicKeys> {
  if (googleKeysPromise && Date.now() - googleKeysCachedAt < GOOGLE_KEYS_CACHE_TTL) {
    return googleKeysPromise
  }
  googleKeysCachedAt = Date.now()
  googleKeysPromise = fetch('https://www.googleapis.com/oauth2/v3/certs', {
    dispatcher: getExternalRequestDispatcher(),
  })
    .then(response => {
      if (!response.ok)
        throw createHttpError(502, `Failed to fetch Google public keys: ${response.status}`)
      return response.json() as Promise<GooglePublicKeys>
    })
    .catch(err => {
      googleKeysPromise = null
      throw err
    })
  return googleKeysPromise
}

function verifyGoogleJwtWithKey(credential: string, key: GooglePublicKey): GoogleJWTPayload {
  const [headerB64, payloadB64, signatureB64] = credential.split('.')
  assert(headerB64 && payloadB64 && signatureB64, 422, 'Invalid Google credential format')

  const publicKey = createPublicKey({
    key: { kty: key.kty, n: key.n, e: key.e },
    format: 'jwk',
  })

  const verify = createVerify('SHA256')
  verify.update(`${headerB64}.${payloadB64}`)
  const isValid = verify.verify(publicKey, Buffer.from(signatureB64, 'base64url'))
  if (!isValid) throw createHttpError(401, 'Google credential signature is invalid')

  const payload = decodeJwtPart(payloadB64) as GoogleJWTPayload

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp < now) throw createHttpError(401, 'Google credential has expired')
  if (payload.iat > now + 5 * 60)
    throw createHttpError(401, 'Google credential issued in the future')
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw createHttpError(401, 'Google credential issuer is invalid')
  }
  if (!GOOGLE_CLIENT_ID) throw createHttpError(500, 'Google OAuth not configured')
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw createHttpError(401, 'Google credential audience is invalid')
  }

  return payload
}

async function verifyGoogleCredential(credential: string): Promise<GoogleJWTPayload> {
  const [headerB64] = credential.split('.')
  assert(headerB64, 422, 'Invalid Google credential')

  const header = decodeJwtPart(headerB64) as { kid?: string; alg?: string }
  if (header.alg !== 'RS256')
    throw createHttpError(401, 'Google credential uses unsupported algorithm')
  let keys = await fetchGooglePublicKeys()
  let matchingKey = keys.keys.find(k => k.kid === header.kid)
  if (!matchingKey) {
    // Key may have rotated during cache TTL; force-refresh and retry once
    googleKeysPromise = null
    keys = await fetchGooglePublicKeys()
    matchingKey = keys.keys.find(k => k.kid === header.kid)
    if (!matchingKey) throw createHttpError(401, 'Google credential key not found')
  }

  return verifyGoogleJwtWithKey(credential, matchingKey)
}

export async function upsertGoogleAccount(credential: string): Promise<OAuthAccount> {
  const payload = await verifyGoogleCredential(credential)
  const providerUserData: Record<string, unknown> = {}
  if (payload.name) providerUserData.name = payload.name
  if (payload.email) providerUserData.email = payload.email
  if (payload.picture) providerUserData.picture = payload.picture
  if (payload.given_name) providerUserData.given_name = payload.given_name
  if (payload.family_name) providerUserData.family_name = payload.family_name

  return upsertOAuthAccount(
    'google',
    payload.sub,
    payload.email_verified ? (payload.email ?? null) : null,
    providerUserData,
  )
}

export function getGoogleAccountByGoogleUserId(googleUserId: string): Promise<OAuthAccount | null> {
  return getOAuthAccountByProviderUserId('google', googleUserId)
}
