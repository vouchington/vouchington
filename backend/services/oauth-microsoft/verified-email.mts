import createHttpError from 'http-errors'
import { MICROSOFT_CLIENT_ID, MICROSOFT_TENANT_ID } from '@voucha/config'
import {
  createOidcIdTokenVerifier,
  microsoftProfileFromClaims,
} from '@vouchington/utils/oidc-id-token'
import { verifyOidcIdToken } from '@services/oauth-accounts'
import { getExternalFetch } from '@modules/utils/http'

const tenant = MICROSOFT_TENANT_ID || 'common'
const tenantAlias = ['common', 'organizations', 'consumers'].includes(tenant)
const tenantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const verifier = createOidcIdTokenVerifier({
  jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
  issuers: [],
  issuerMatches: (claims, keyIssuer) => {
    const tid = claims.tid
    if (typeof tid !== 'string' || !tenantIdPattern.test(tid)) return false
    const issuer = `https://login.microsoftonline.com/${tid}/v2.0`
    return (
      (tenantAlias || tid === tenant) &&
      claims.iss === issuer &&
      (keyIssuer === undefined || keyIssuer.replace('{tenantid}', tid) === issuer)
    )
  },
  audiences: () => [MICROSOFT_CLIENT_ID].filter(Boolean),
  fetch: (input, init) => getExternalFetch()(input, init),
})

/** Verify signed identity and retain the nonce needed only for linked-provider confirmation. */
export async function verifyMicrosoftIdentityToken(
  idToken: string,
  providerUserId: string,
  signal?: AbortSignal,
): Promise<{ email: string | null; nonce: unknown }> {
  const claims = await verifyOidcIdToken(verifier, idToken, 'Microsoft', { signal })
  const now = Math.floor(Date.now() / 1000)
  if (
    !MICROSOFT_CLIENT_ID ||
    claims.aud !== MICROSOFT_CLIENT_ID ||
    claims.oid !== providerUserId ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now))
  ) {
    throw createHttpError(401, 'Microsoft identity token claims are invalid')
  }
  return { email: microsoftProfileFromClaims(claims).verifiedEmail, nonce: claims.nonce }
}
