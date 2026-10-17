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
import type { upsertLinkedInAccount } from '@services/oauth-linkedin'
import type { upsertMicrosoftAccount } from '@services/oauth-microsoft'
import type { upsertXAccount } from '@services/oauth-x'
import type { upsertGoogleAuthorizationCodeAccount } from '@services/oauth-google'

export type OAuthAuthorizationExchangeDependencies = {
  validateClaim: typeof validateOAuthAuthorizationExchangeClaim
  claim: typeof claimOAuthAuthorizationExchange
  decryptCode: typeof decryptOAuthAuthorizationCode
  decryptVerifier: typeof decryptOAuthAuthorizationPkceVerifier
  upsertFacebook: typeof upsertFacebookAuthorizationCodeAccount
  upsertGithub: typeof upsertGithubAccount
  upsertLinkedIn: typeof upsertLinkedInAccount
  upsertMicrosoft: typeof upsertMicrosoftAccount
  upsertX: typeof upsertXAccount
  upsertGoogle: typeof upsertGoogleAuthorizationCodeAccount
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
  const providerInput =
    authorization.provider === 'facebook' || authorization.provider === 'linkedin'
      ? { provider: authorization.provider, codeVerifier: undefined }
      : {
          provider: authorization.provider,
          codeVerifier: dependencies.decryptVerifier(
            authorization.id,
            authorization.pkce_verifier_ciphertext,
          ),
        }
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
  switch (providerInput.provider) {
    case 'facebook':
      await dependencies.upsertFacebook(code, authorization.redirect_uri, completionOptions)
      break
    case 'x':
      await dependencies.upsertX(
        code,
        authorization.redirect_uri,
        providerInput.codeVerifier,
        completionOptions,
      )
      break
    case 'github':
      await dependencies.upsertGithub(code, authorization.redirect_uri, {
        codeVerifier: providerInput.codeVerifier,
        ...completionOptions,
      })
      break
    case 'linkedin':
      await dependencies.upsertLinkedIn(
        code,
        authorization.redirect_uri,
        undefined,
        completionOptions,
      )
      break
    case 'microsoft':
      await dependencies.upsertMicrosoft(
        code,
        authorization.redirect_uri,
        providerInput.codeVerifier,
        completionOptions,
      )
      break
    case 'google':
      await dependencies.upsertGoogle(
        code,
        authorization.redirect_uri,
        providerInput.codeVerifier!,
        completionOptions,
      )
      break
  }
}
