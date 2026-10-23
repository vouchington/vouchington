import { verifyGoogleCredential } from './identity-token.mts'
export { verifyGoogleCredential } from './identity-token.mts'
import type {
  OAuthAccountUpsertOptions,
  PreparedOAuthAccount,
} from '@services/oauth-accounts/reauthentication'
import {
  prepareOAuthAccountPersistence,
  getOAuthAccountByProviderUserId,
  type OAuthAccount,
} from '@services/oauth-accounts'

export async function prepareGoogleAccount(
  credential: string,
  options: OAuthAccountUpsertOptions = {},
): Promise<PreparedOAuthAccount> {
  const payload = await verifyGoogleCredential(credential)
  const providerUserData: Record<string, unknown> = {}
  if (payload.name) providerUserData.name = payload.name
  if (payload.email) providerUserData.email = payload.email
  if (payload.picture) providerUserData.picture = payload.picture
  if (payload.given_name) providerUserData.given_name = payload.given_name
  if (payload.family_name) providerUserData.family_name = payload.family_name

  return prepareOAuthAccountPersistence(
    'google',
    payload.sub,
    payload.email_verified ? (payload.email ?? null) : null,
    providerUserData,
    undefined,
    options,
  )
}

export { upsertGoogleAuthorizationCodeAccount } from './authorization-code.mts'

/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/README.md`.
 */
export function getGoogleAccountByGoogleUserId(googleUserId: string): Promise<OAuthAccount | null> {
  return getOAuthAccountByProviderUserId('google', googleUserId)
}
