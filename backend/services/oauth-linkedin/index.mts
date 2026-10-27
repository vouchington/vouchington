import { linkedinProvider } from '@vouchington/utils/oauth-providers'
import { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } from '@voucha/config'
import {
  redeemProviderAccount,
  prepareRedeemedProviderAccount,
  type OAuthAccount,
} from '@services/oauth-accounts'
import type {
  OAuthAccountUpsertOptions,
  PreparedOAuthAccount,
} from '@services/oauth-accounts/reauthentication'
import { getExternalFetch } from '@modules/utils/http'

export async function prepareLinkedInAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string | undefined,
  options: OAuthAccountUpsertOptions & {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<PreparedOAuthAccount> {
  return prepareRedeemedProviderAccount(
    linkedinProvider({ clientId: LINKEDIN_CLIENT_ID, clientSecret: LINKEDIN_CLIENT_SECRET }),
    { code, redirectUri, codeVerifier },
    { ...options, label: 'LinkedIn', fetch: getExternalFetch() },
  )
}

export async function upsertLinkedInAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string | undefined,
  options: Parameters<typeof prepareLinkedInAccount>[3] = {},
): Promise<OAuthAccount> {
  return redeemProviderAccount(
    linkedinProvider({ clientId: LINKEDIN_CLIENT_ID, clientSecret: LINKEDIN_CLIENT_SECRET }),
    { code, redirectUri, codeVerifier },
    { ...options, label: 'LinkedIn', fetch: getExternalFetch() },
  )
}
