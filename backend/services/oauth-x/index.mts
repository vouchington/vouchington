import { xProvider } from '@vouchington/utils/oauth-providers'
import { X_CLIENT_ID, X_CLIENT_SECRET } from '@voucha/config'
import { redeemProviderAccount, type OAuthAccount } from '@services/oauth-accounts'
import { getProviderFetch } from '@modules/api-egress-proxy'

export async function upsertXAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  return redeemProviderAccount(
    xProvider({ clientId: X_CLIENT_ID, clientSecret: X_CLIENT_SECRET }),
    { code, redirectUri, codeVerifier },
    { ...options, label: 'X', fetch: getProviderFetch('x_oauth_enabled') },
  )
}
