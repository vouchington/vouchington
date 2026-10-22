import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto'
import createHttpError from 'http-errors'
import { MICROSOFT_CLIENT_ID, MICROSOFT_TENANT_ID } from '@voucha/config'
import { decodeJwtPart } from '@services/oauth-accounts/jwt'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

type MicrosoftKey = JsonWebKey & { kid?: string; alg?: string; use?: string; issuer?: string }
type MicrosoftClaims = {
  aud?: string
  iss?: string
  tid?: string
  oid?: string
  exp?: number
  nbf?: number
  email?: string
  xms_edov?: boolean
}

let keysPromise: Promise<{ keys: MicrosoftKey[] }> | null = null
let keysCachedAt = 0
const KEYS_CACHE_TTL = 60 * 60 * 1000

/* no-mistakes: integration=oauth */
function fetchMicrosoftKeys(signal?: AbortSignal, forceRefresh = false) {
  if (!forceRefresh && keysPromise && Date.now() - keysCachedAt < KEYS_CACHE_TTL) {
    return keysPromise
  }
  keysCachedAt = Date.now()
  keysPromise = fetch('https://login.microsoftonline.com/common/discovery/v2.0/keys', {
    dispatcher: getExternalRequestDispatcher(),
    signal,
  })
    .then(response => {
      if (!response.ok) throw createHttpError(502, 'Microsoft signing keys request failed')
      return response.json() as Promise<{ keys: MicrosoftKey[] }>
    })
    .catch(err => {
      keysPromise = null
      throw err
    })
  return keysPromise
}

export async function getMicrosoftVerifiedEmail(
  idToken: string | undefined,
  providerUserId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!idToken) return null
  const [headerPart, payloadPart, signaturePart] = idToken.split('.')
  if (!headerPart || !payloadPart || !signaturePart) {
    throw createHttpError(401, 'Invalid Microsoft identity token')
  }
  const header = decodeJwtPart(headerPart) as { alg?: string; kid?: string }
  if (header.alg !== 'RS256' || !header.kid) {
    throw createHttpError(401, 'Invalid Microsoft identity token algorithm')
  }
  let keys = await fetchMicrosoftKeys(signal)
  let key = keys.keys.find(candidate => candidate.kid === header.kid)
  if (!key) {
    // Refresh once on key rotation, including while the cached set is still fresh.
    keys = await fetchMicrosoftKeys(signal, true)
    key = keys.keys.find(candidate => candidate.kid === header.kid)
  }
  if (
    !key ||
    key.kty !== 'RSA' ||
    (key.use && key.use !== 'sig') ||
    (key.alg && key.alg !== 'RS256')
  ) {
    throw createHttpError(401, 'Microsoft identity token key not found')
  }
  const verifier = createVerify('SHA256')
  verifier.update(`${headerPart}.${payloadPart}`)
  if (
    !verifier.verify(
      createPublicKey({ key, format: 'jwk' }),
      Buffer.from(signaturePart, 'base64url'),
    )
  ) {
    throw createHttpError(401, 'Microsoft identity token signature is invalid')
  }
  const claims = decodeJwtPart(payloadPart) as MicrosoftClaims
  const now = Math.floor(Date.now() / 1000)
  const tenant = MICROSOFT_TENANT_ID || 'common'
  const tenantIsAlias = ['common', 'organizations', 'consumers'].includes(tenant)
  if (
    !claims.tid ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.tid) ||
    (!tenantIsAlias && claims.tid !== tenant) ||
    claims.iss !== `https://login.microsoftonline.com/${claims.tid}/v2.0` ||
    (key.issuer !== undefined && key.issuer.replace('{tenantid}', claims.tid) !== claims.iss) ||
    !MICROSOFT_CLIENT_ID ||
    claims.aud !== MICROSOFT_CLIENT_ID ||
    claims.oid !== providerUserId ||
    typeof claims.exp !== 'number' ||
    claims.exp <= now ||
    (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now))
  ) {
    throw createHttpError(401, 'Microsoft identity token claims are invalid')
  }
  // xms_edov covers the token's email claim, never Graph mail or userPrincipalName.
  return claims.xms_edov === true && typeof claims.email === 'string' ? claims.email : null
}
