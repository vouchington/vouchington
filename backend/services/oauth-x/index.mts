import { xProvider } from '@vouchington/utils/oauth-providers'
import { X_CLIENT_ID, X_CLIENT_SECRET } from '@voucha/config'
import {
  redeemProviderAccount,
  prepareRedeemedProviderAccount,
  type OAuthAccount,
} from '@services/oauth-accounts'
import type { OAuthAccountUpsertOptions, PreparedOAuthAccount } from '@services/oauth-accounts/reauthentication'
import { getProviderFetch } from '@modules/api-egress-proxy'

export async function prepareXAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: OAuthAccountUpsertOptions & {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<PreparedOAuthAccount> {
  return prepareRedeemedProviderAccount(
    xProvider({ clientId: X_CLIENT_ID, clientSecret: X_CLIENT_SECRET }),
    { code, redirectUri, codeVerifier },
    { ...options, label: 'X', fetch: getProviderFetch('x_oauth_enabled') },
  )
}

export async function upsertXAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: Parameters<typeof prepareXAccount>[3] = {},
): Promise<OAuthAccount> {
  return redeemProviderAccount(
    xProvider({ clientId: X_CLIENT_ID, clientSecret: X_CLIENT_SECRET }),
    { code, redirectUri, codeVerifier },
    { ...options, label: 'X', fetch: getProviderFetch('x_oauth_enabled') },
  )
}
