import { createHash, createPublicKey, createVerify } from 'node:crypto'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { APPLE_CLIENT_ID, APPLE_NATIVE_CLIENT_IDS } from '@voucha/config'
import {
  upsertOAuthAccount,
  getOAuthAccountByProviderUserId,
  type OAuthAccount,
} from '@services/oauth-accounts'
import { decodeJwtPart } from '@services/oauth-accounts/jwt'
import {
  createProviderOperationSignal,
  getProviderFetch,
  rethrowProviderTransportError,
} from '@modules/api-egress-proxy'

type AppleJWTPayload = {
  iss: string
  aud: string
  exp: number
  iat: number
  sub: string
  email?: string
  email_verified?: string | boolean
  nonce?: string
  nonce_supported?: boolean
  is_private_email?: string | boolean
}

type ApplePublicKey = {
  kty: string
  kid: string
  use: string
  alg: string
  n: string
  e: string
}

type ApplePublicKeys = {
  keys: ApplePublicKey[]
}

let appleKeysPromise: Promise<ApplePublicKeys> | null = null
let appleKeysCachedAt = 0
const APPLE_KEYS_CACHE_TTL = 60 * 60 * 1000 // 1 hour

/* no-mistakes: integration=oauth */
function fetchApplePublicKeys(
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
): Promise<ApplePublicKeys> {
  if (
    !options.forceRefresh &&
    appleKeysPromise &&
    Date.now() - appleKeysCachedAt < APPLE_KEYS_CACHE_TTL
  ) {
    return appleKeysPromise
  }
  const keysPromise = getProviderFetch('apple_oauth_enabled')(
    'https://appleid.apple.com/auth/keys',
    {
      signal: createProviderOperationSignal(options.signal),
    },
  )
    .then(response => {
      if (!response.ok)
        throw createHttpError(502, `Failed to fetch Apple public keys: ${response.status}`)
      return response.json() as Promise<ApplePublicKeys>
    })
    .catch(err => {
      appleKeysPromise = null
      rethrowProviderTransportError('Apple', err)
    })
  appleKeysCachedAt = Date.now()
  appleKeysPromise = keysPromise
  return keysPromise
}

function verifyAppleJwtWithKey(identityToken: string, key: ApplePublicKey): AppleJWTPayload {
  const [headerB64, payloadB64, signatureB64] = identityToken.split('.')
  assert(headerB64 && payloadB64 && signatureB64, 422, 'Invalid Apple identity token format')

  const publicKey = createPublicKey({
    key: {
      kty: key.kty,
      n: key.n,
      e: key.e,
    },
    format: 'jwk',
  })

  const verify = createVerify('SHA256')
  verify.update(`${headerB64}.${payloadB64}`)
  const isValid = verify.verify(publicKey, Buffer.from(signatureB64, 'base64url'))
  if (!isValid) throw createHttpError(401, 'Apple identity token signature is invalid')

  const payload = decodeJwtPart(payloadB64) as AppleJWTPayload

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp < now) throw createHttpError(401, 'Apple identity token has expired')
  if (payload.iat > now + 5 * 60)
    throw createHttpError(401, 'Apple identity token issued in the future')
  if (payload.iss !== 'https://appleid.apple.com') {
    throw createHttpError(401, 'Apple identity token issuer is invalid')
  }
  const acceptedAudiences = [APPLE_CLIENT_ID, ...APPLE_NATIVE_CLIENT_IDS].filter(Boolean)
  if (acceptedAudiences.length === 0) throw createHttpError(500, 'Apple OAuth not configured')
  if (!acceptedAudiences.includes(payload.aud)) {
    throw createHttpError(401, 'Apple identity token audience is invalid')
  }

  return payload
}

async function verifyAppleIdentityToken(
  identityToken: string,
  signal?: AbortSignal,
): Promise<AppleJWTPayload> {
  const [headerB64] = identityToken.split('.')
  assert(headerB64, 422, 'Invalid Apple identity token')

  const header = decodeJwtPart(headerB64) as { kid?: string; alg?: string }
  if (header.alg !== 'RS256')
    throw createHttpError(401, 'Apple identity token uses unsupported algorithm')
  let keys = await fetchApplePublicKeys({ signal })
  let matchingKey = keys.keys.find(k => k.kid === header.kid)
  if (!matchingKey) {
    // Key may have rotated during cache TTL; force-refresh and retry once
    keys = await fetchApplePublicKeys({ forceRefresh: true, signal })
    matchingKey = keys.keys.find(k => k.kid === header.kid)
    if (!matchingKey) throw createHttpError(401, 'Apple identity token key not found')
  }

  return verifyAppleJwtWithKey(identityToken, matchingKey)
}

export async function upsertAppleAccount(
  identityToken: string,
  userData?: { name?: string },
  nonce?: string,
  options: { requireVerifiedEmail?: boolean; signal?: AbortSignal } = {},
): Promise<OAuthAccount> {
  const payload = await verifyAppleIdentityToken(identityToken, options.signal)
  if (nonce) {
    if (!payload.nonce) throw createHttpError(401, 'Apple identity token must contain nonce claim')
    const hashedNonce = createHash('sha256').update(nonce).digest('hex')
    if (payload.nonce !== hashedNonce) {
      throw createHttpError(401, 'Apple identity token nonce is invalid')
    }
  }
  const providerUserData: Record<string, unknown> = {}
  if (userData?.name) providerUserData.name = userData.name
  if (payload.email) providerUserData.email = payload.email

  const email =
    payload.email_verified === true || payload.email_verified === 'true'
      ? (payload.email ?? null)
      : null
  if (!email) {
    const existingAccount = await getOAuthAccountByProviderUserId('apple', payload.sub)
    if (!existingAccount && options.requireVerifiedEmail !== false) {
      throw createHttpError(422, 'Apple identity token must include a verified email')
    }
    return existingAccount ?? upsertOAuthAccount('apple', payload.sub, null, providerUserData)
  }
  return upsertOAuthAccount('apple', payload.sub, email, providerUserData)
}

export function getAppleAccountByAppleUserId(appleUserId: string): Promise<OAuthAccount | null> {
  return getOAuthAccountByProviderUserId('apple', appleUserId)
}
