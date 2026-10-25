import { githubProvider } from '@vouchington/utils/oauth-providers'
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from '@voucha/config'
import { redeemProviderAccount, type OAuthAccount } from '@services/oauth-accounts'
import { getProviderFetch } from '@modules/api-egress-proxy'

export async function upsertGithubAccount(
  code: string,
  redirectUri: string,
  options: {
    codeVerifier?: string
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  return redeemProviderAccount(
    githubProvider({ clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET }),
    { code, redirectUri, codeVerifier: options.codeVerifier },
    { ...options, label: 'GitHub', fetch: getProviderFetch('github_oauth_enabled') },
  )
}
