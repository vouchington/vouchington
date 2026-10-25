import { microsoftProvider } from '@vouchington/utils/oauth-providers'
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID } from '@voucha/config'
import { redeemProviderAccount, type OAuthAccount } from '@services/oauth-accounts'
import { getExternalFetch } from '@modules/utils/http'

export async function upsertMicrosoftAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be defined')
  }
  return redeemProviderAccount(
    microsoftProvider({
      clientId: MICROSOFT_CLIENT_ID,
      clientSecret: MICROSOFT_CLIENT_SECRET,
      tenantId: MICROSOFT_TENANT_ID,
    }),
    { code, redirectUri, codeVerifier },
    { ...options, label: 'Microsoft', fetch: getExternalFetch() },
  )
}
