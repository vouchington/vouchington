import type {
  ClaimedOAuthAuthorization,
  claimOAuthAuthorizationExchange,
  rejectExhaustedOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
  validateOAuthAuthorizationExchangeClaim,
} from './authorization-exchange-state.mts'
import type {
  decryptOAuthAuthorizationCode,
  decryptOAuthAuthorizationPkceVerifier,
} from './authorization-broker.mts'
import type { upsertFacebookAuthorizationCodeAccount } from '@services/oauth-facebook'
import type { upsertGithubAccount } from '@services/oauth-github'
import type { upsertXAccount } from '@services/oauth-x'

export type OAuthAuthorizationExchangeDependencies = {
  validateClaim: typeof validateOAuthAuthorizationExchangeClaim
  claim: typeof claimOAuthAuthorizationExchange
  decryptCode: typeof decryptOAuthAuthorizationCode
  decryptVerifier: typeof decryptOAuthAuthorizationPkceVerifier
  upsertFacebook: typeof upsertFacebookAuthorizationCodeAccount
  upsertGithub: typeof upsertGithubAccount
  upsertX: typeof upsertXAccount
  rejectExhausted: typeof rejectExhaustedOAuthAuthorizationExchange
  releaseClaim: typeof releaseOAuthAuthorizationExchangeClaim
}

export type OAuthExchangeOwnership = {
  claimId?: string
  providerRequestArmed?: boolean
  persist(claimId: string | null, providerRequestArmed?: boolean): Promise<void>
}

/** Keep the write-ahead marker, fresh native claim check and original provider routing in one path. */
export async function exchangeClaimedOAuthAuthorization(
  authorization: ClaimedOAuthAuthorization,
  dependencies: OAuthAuthorizationExchangeDependencies,
  ownership: OAuthExchangeOwnership | undefined,
  admission: { armed: boolean },
  signal: AbortSignal,
): Promise<void> {
  const code = dependencies.decryptCode(authorization.id, authorization.callback_code_ciphertext)
  const codeVerifier =
    authorization.provider === 'facebook'
      ? undefined
      : dependencies.decryptVerifier(authorization.id, authorization.pkce_verifier_ciphertext)
  await ownership?.persist(authorization.exchange_claim_id, true)
  admission.armed = ownership !== undefined
  signal.throwIfAborted()
  await dependencies.validateClaim(authorization.id, authorization.exchange_claim_id)
  signal.throwIfAborted()
  const completionOptions = {
    authorizationId: authorization.id,
    authorizationClaimId: authorization.exchange_claim_id,
    signal,
  }
  switch (authorization.provider) {
    case 'facebook':
      await dependencies.upsertFacebook(code, authorization.redirect_uri, completionOptions)
      break
    case 'x':
      if (codeVerifier === undefined)
        throw new Error('X provider admission requires its PKCE verifier')
      await dependencies.upsertX(code, authorization.redirect_uri, codeVerifier, completionOptions)
      break
    case 'github':
      if (codeVerifier === undefined)
        throw new Error('GitHub provider admission requires its PKCE verifier')
      await dependencies.upsertGithub(code, authorization.redirect_uri, {
        codeVerifier,
        ...completionOptions,
      })
  }
}
