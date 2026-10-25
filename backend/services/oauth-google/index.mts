import {
  createOidcIdTokenVerifier,
  googleProfileFromClaims,
} from '@vouchington/utils/oidc-id-token'
import { readGoogleClientId } from '@voucha/config'
import {
  prepareOAuthAccountPersistence,
  verifyOidcIdToken,
  type OAuthAccount,
} from '@services/oauth-accounts'
import type {
  OAuthAccountUpsertOptions,
  PreparedOAuthAccount,
} from '@services/oauth-accounts/reauthentication'
import { getExternalFetch } from '@modules/utils/http'

const googleIdTokenVerifier = createOidcIdTokenVerifier({
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['accounts.google.com', 'https://accounts.google.com'],
  audiences: () => [readGoogleClientId()].filter(Boolean),
  fetch: (input, init) => getExternalFetch()(input, init),
})

export async function upsertGoogleAccount(credential: string): Promise<OAuthAccount> {
  return (await prepareGoogleAccount(credential)).persist()
}

export async function prepareGoogleAccount(
  credential: string,
  options: OAuthAccountUpsertOptions = {},
): Promise<PreparedOAuthAccount> {
  const claims = await verifyOidcIdToken(googleIdTokenVerifier, credential, 'Google')
  const profile = googleProfileFromClaims(claims)
  return prepareOAuthAccountPersistence(
    'google',
    profile.providerUserId,
    profile.verifiedEmail,
    profile.data,
    undefined,
    options,
  )
}

export function verifyGoogleCredential(credential: string) {
  return verifyOidcIdToken(googleIdTokenVerifier, credential, 'Google')
}
export { upsertGoogleAuthorizationCodeAccount } from './authorization-code.mts'
