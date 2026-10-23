import type {
  OAuthAccountUpsertOptions,
  PreparedOAuthAccount,
} from '@services/oauth-accounts/reauthentication'
import { createHash } from 'node:crypto'
import createHttpError from 'http-errors'
import {
  prepareOAuthAccountPersistence,
  getOAuthAccountByProviderUserId,
  type OAuthAccount,
} from '@services/oauth-accounts'
import { verifyAppleIdentityToken } from './identity-token.mts'

export { verifyAppleIdentityToken } from './identity-token.mts'

export async function prepareAppleAccount(
  identityToken: string,
  userData?: { name?: string },
  nonce?: string,
  options: OAuthAccountUpsertOptions & {
    requireVerifiedEmail?: boolean
    signal?: AbortSignal
  } = {},
): Promise<PreparedOAuthAccount> {
  const payload = await verifyAppleIdentityToken(identityToken, options.signal)
  if (nonce) {
    if (!payload.nonce) throw createHttpError(401, 'Apple identity token must contain nonce claim')
    const hashedNonce = createHash('sha256').update(nonce).digest('hex')
    if (payload.nonce !== hashedNonce) {
      throw createHttpError(401, 'Apple identity token nonce is invalid')
    }
  }
  const providerUserData: Record<string, unknown> = {}
  if (userData?.name) providerUserData.name = userData.name
  if (payload.email) providerUserData.email = payload.email

  const email =
    payload.email_verified === true || payload.email_verified === 'true'
      ? (payload.email ?? null)
      : null
  if (!email) {
    const existingAccount = await getOAuthAccountByProviderUserId('apple', payload.sub)
    if (!existingAccount && options.requireVerifiedEmail !== false) {
      throw createHttpError(422, 'Apple identity token must include a verified email')
    }
    return existingAccount
      ? { persist: async () => existingAccount }
      : prepareOAuthAccountPersistence(
          'apple',
          payload.sub,
          null,
          providerUserData,
          undefined,
          options,
        )
  }
  return prepareOAuthAccountPersistence(
    'apple',
    payload.sub,
    email,
    providerUserData,
    undefined,
    options,
  )
}

/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/README.md`.
 */
export function getAppleAccountByAppleUserId(appleUserId: string): Promise<OAuthAccount | null> {
  return getOAuthAccountByProviderUserId('apple', appleUserId)
}
