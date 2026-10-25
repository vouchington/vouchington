import createHttpError from 'http-errors'
import { appleProfileFromClaims, createOidcIdTokenVerifier } from '@vouchington/utils/oidc-id-token'
import { APPLE_CLIENT_ID, APPLE_NATIVE_CLIENT_IDS } from '@voucha/config'
import {
  prepareOAuthAccountPersistence,
  getOAuthAccountByProviderUserId,
  verifyOidcIdToken,
  type OAuthAccount,
} from '@services/oauth-accounts'
import type {
  OAuthAccountUpsertOptions,
  PreparedOAuthAccount,
} from '@services/oauth-accounts/reauthentication'
import { createProviderOperationSignal, getProviderFetch } from '@modules/api-egress-proxy'

const appleIdTokenVerifier = createOidcIdTokenVerifier({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  issuers: ['https://appleid.apple.com'],
  audiences: () => [APPLE_CLIENT_ID, ...APPLE_NATIVE_CLIENT_IDS].filter(Boolean),
  fetch: (input, init) =>
    getProviderFetch('apple_oauth_enabled')(input, {
      ...init,
      signal: createProviderOperationSignal(),
    }),
})

export async function upsertAppleAccount(
  identityToken: string,
  userData?: { name?: string },
  nonce?: string,
  options: OAuthAccountUpsertOptions & {
    requireVerifiedEmail?: boolean
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  return (await prepareAppleAccount(identityToken, userData, nonce, options)).persist(options)
}

export function verifyAppleIdentityToken(identityToken: string, signal?: AbortSignal) {
  return verifyOidcIdToken(appleIdTokenVerifier, identityToken, 'Apple', { signal })
}

export async function prepareAppleAccount(
  identityToken: string,
  userData?: { name?: string },
  nonce?: string,
  options: OAuthAccountUpsertOptions & {
    requireVerifiedEmail?: boolean
    signal?: AbortSignal
  } = {},
): Promise<PreparedOAuthAccount> {
  const claims = await verifyOidcIdToken(appleIdTokenVerifier, identityToken, 'Apple', {
    signal: options.signal,
    ...(nonce ? { nonce, nonceHash: 'sha256-hex' } : {}),
  })
  const profile = appleProfileFromClaims(claims, userData)
  if (!profile.verifiedEmail) {
    const existingAccount = await getOAuthAccountByProviderUserId('apple', profile.providerUserId)
    if (!existingAccount && options.requireVerifiedEmail !== false) {
      throw createHttpError(422, 'Apple identity token must include a verified email')
    }
    const prepared = prepareOAuthAccountPersistence(
      'apple',
      profile.providerUserId,
      null,
      profile.data,
      undefined,
      options,
    )
    return existingAccount
      ? {
          persist: persistence =>
            persistence?.reAuth || options.reAuth
              ? prepared.persist(persistence)
              : Promise.resolve(existingAccount),
        }
      : prepared
  }
  return prepareOAuthAccountPersistence(
    'apple',
    profile.providerUserId,
    profile.verifiedEmail,
    profile.data,
    undefined,
    options,
  )
}
