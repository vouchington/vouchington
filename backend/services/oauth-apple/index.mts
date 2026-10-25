import createHttpError from 'http-errors'
import { appleProfileFromClaims, createOidcIdTokenVerifier } from '@vouchington/utils/oidc-id-token'
import { APPLE_CLIENT_ID, APPLE_NATIVE_CLIENT_IDS } from '@voucha/config'
import {
  upsertOAuthAccount,
  getOAuthAccountByProviderUserId,
  verifyOidcIdToken,
  type OAuthAccount,
} from '@services/oauth-accounts'
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
  options: { requireVerifiedEmail?: boolean; signal?: AbortSignal } = {},
): Promise<OAuthAccount> {
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
    return (
      existingAccount ?? upsertOAuthAccount('apple', profile.providerUserId, null, profile.data)
    )
  }
  return upsertOAuthAccount('apple', profile.providerUserId, profile.verifiedEmail, profile.data)
}
