import { facebookProvider } from '@vouchington/utils/oauth-providers'
import { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_GRAPHQL_VERSION } from '@voucha/config'
import {
  prepareRedeemedProviderAccount,
  redeemProviderAccount,
  type OAuthAccount,
} from '@services/oauth-accounts'
import type {
  OAuthAccountUpsertOptions,
  PreparedOAuthAccount,
} from '@services/oauth-accounts/reauthentication'
import { getExternalFetch } from '@modules/utils/http'

type FacebookOptions = OAuthAccountUpsertOptions & { signal?: AbortSignal }

function createFacebookProvider() {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    throw new Error('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be defined')
  }
  return facebookProvider({
    appId: FACEBOOK_APP_ID,
    appSecret: FACEBOOK_APP_SECRET,
    graphVersion: FACEBOOK_GRAPHQL_VERSION,
  })
}

/** Redeems a native client token without persisting before the owning account change. */
export async function prepareFacebookAccount(
  accessToken: string,
  options: FacebookOptions = {},
): Promise<PreparedOAuthAccount> {
  const provider = createFacebookProvider()
  return prepareRedeemedProviderAccount(
    { id: provider.id, redeem: (_input, ctx) => provider.redeemAccessToken(accessToken, ctx) },
    { code: '', redirectUri: '' },
    { ...options, label: 'Facebook', fetch: getExternalFetch() },
  )
}

export async function upsertFacebookAuthorizationCodeAccount(
  code: string,
  redirectUri: string,
  options: FacebookOptions = {},
): Promise<OAuthAccount> {
  return redeemProviderAccount(
    createFacebookProvider(),
    { code, redirectUri },
    { ...options, label: 'Facebook', fetch: getExternalFetch() },
  )
}

export async function upsertFacebookAccount(
  accessToken: string,
  options: FacebookOptions = {},
): Promise<OAuthAccount> {
  return (await prepareFacebookAccount(accessToken, options)).persist()
}
