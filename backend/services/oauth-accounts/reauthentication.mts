import type { TransactionQuery } from '@data-stores/psql'
import { timingSafeEqual } from 'node:crypto'
import { hashToken } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import type { OAuthAccount, OAuthProvider } from './providers.mts'

export type OAuthProviderReAuthContext = {
  userId: string
  provider: OAuthProvider
  providerUserId: string
  flowId: string
  nonceHash: string
}

export type OAuthAccountUpsertOptions = {
  query?: TransactionQuery
  authorizationId?: string
  authorizationClaimId?: string
  reAuth?: OAuthProviderReAuthContext
}

export function hashProviderReAuthNonce(flowId: string, nonce: string): string {
  return hashToken(`oauth-provider-reauth:nonce:${flowId}`, nonce)
}

/** Only compare a nonce extracted from a cryptographically verified provider assertion. */
export function assertProviderReAuthNonce(
  context: Pick<OAuthProviderReAuthContext, 'flowId' | 'nonceHash'>,
  verifiedNonce: unknown,
): void {
  const expected = Buffer.from(context.nonceHash)
  const actual =
    typeof verifiedNonce === 'string'
      ? Buffer.from(hashProviderReAuthNonce(context.flowId, verifiedNonce))
      : Buffer.alloc(0)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw createHttpError(401, 'Provider reauthentication nonce is invalid')
  }
}

export type PreparedOAuthAccount = {
  persist: (options?: OAuthAccountUpsertOptions) => Promise<OAuthAccount>
}
