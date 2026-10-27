import { googleProvider } from '@vouchington/utils/oauth-providers'
import { readGoogleClientId, readGoogleClientSecret } from '@voucha/config'
import { redeemProviderAccount, type OAuthAccount } from '@services/oauth-accounts'
import { getExternalFetch } from '@modules/utils/http'
import type { OAuthAccountUpsertOptions } from '@services/oauth-accounts/reauthentication'

/** Redeems a confidential broker authorization code and identifies the account by Google's stable sub. */
export async function upsertGoogleAuthorizationCodeAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: OAuthAccountUpsertOptions & {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  return redeemProviderAccount(
    googleProvider({ clientId: readGoogleClientId(), clientSecret: readGoogleClientSecret() }),
    { code, redirectUri, codeVerifier },
    { ...options, label: 'Google', fetch: getExternalFetch() },
  )
}
