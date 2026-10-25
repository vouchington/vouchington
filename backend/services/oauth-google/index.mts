import {
  createOidcIdTokenVerifier,
  googleProfileFromClaims,
} from '@vouchington/utils/oidc-id-token'
import { readGoogleClientId } from '@voucha/config'
import { upsertOAuthAccount, verifyOidcIdToken, type OAuthAccount } from '@services/oauth-accounts'
import { getExternalFetch } from '@modules/utils/http'

const googleIdTokenVerifier = createOidcIdTokenVerifier({
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['accounts.google.com', 'https://accounts.google.com'],
  audiences: () => [readGoogleClientId()].filter(Boolean),
  fetch: (input, init) => getExternalFetch()(input, init),
})

export async function upsertGoogleAccount(credential: string): Promise<OAuthAccount> {
  const claims = await verifyOidcIdToken(googleIdTokenVerifier, credential, 'Google')
  const profile = googleProfileFromClaims(claims)
  return upsertOAuthAccount('google', profile.providerUserId, profile.verifiedEmail, profile.data)
}

export { upsertGoogleAuthorizationCodeAccount } from './authorization-code.mts'
