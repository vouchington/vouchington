import { linkedinProvider } from '@vouchington/utils/oauth-providers'
import { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } from '@voucha/config'
import { redeemProviderAccount, type OAuthAccount } from '@services/oauth-accounts'
import { getExternalFetch } from '@modules/utils/http'

export async function upsertLinkedInAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string | undefined,
  options: {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  return redeemProviderAccount(
    linkedinProvider({ clientId: LINKEDIN_CLIENT_ID, clientSecret: LINKEDIN_CLIENT_SECRET }),
    { code, redirectUri, codeVerifier },
    { ...options, label: 'LinkedIn', fetch: getExternalFetch() },
  )
}
