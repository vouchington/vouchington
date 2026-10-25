import createHttpError from 'http-errors'
import {
  OAuthProviderError,
  type AuthorizationCodeInput,
  type OAuthFetch,
  type OAuthProvider as ProviderClient,
} from '@vouchington/utils/oauth-providers'
import {
  createProviderOperationSignal,
  rethrowProviderTransportError,
} from '@modules/api-egress-proxy'
import { providerTableConfigs, type OAuthAccount, type OAuthProvider } from './providers.mts'
import { upsertOAuthAccount } from './upsert.mts'

export type RedeemProviderAccountOptions = {
  fetch: OAuthFetch
  label: string
  authorizationId?: string
  authorizationClaimId?: string
  signal?: AbortSignal
}

/**
 * Redeems an authorization code through a package provider and persists the resulting account.
 * Every provider request gets its own operation timeout so later stages do not inherit earlier ones.
 */
/* no-mistakes: integration=oauth */
export async function redeemProviderAccount(
  client: ProviderClient,
  input: AuthorizationCodeInput,
  options: RedeemProviderAccountOptions,
): Promise<OAuthAccount> {
  const provider = client.id as OAuthProvider
  const redeemed = await client
    .redeem(input, {
      fetch: (url, init) =>
        options.fetch(url, { ...init, signal: createProviderOperationSignal(options.signal) }),
    })
    .catch((err: unknown) => {
      if (err instanceof OAuthProviderError) {
        throw createHttpError(502, err.message, { cause: err })
      }
      return rethrowProviderTransportError(options.label, err)
    })
  options.signal?.throwIfAborted()
  const { tokens, profile } = redeemed
  return upsertOAuthAccount(
    provider,
    profile.providerUserId,
    profile.verifiedEmail,
    profile.data,
    providerTableConfigs[provider].hasTokenColumns ? tokens : undefined,
    {
      authorizationId: options.authorizationId,
      authorizationClaimId: options.authorizationClaimId,
    },
  )
}
