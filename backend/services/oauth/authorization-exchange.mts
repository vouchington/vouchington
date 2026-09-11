import { upsertFacebookAuthorizationCodeAccount } from '@services/oauth-facebook'
import { upsertGithubAccount } from '@services/oauth-github'
import { upsertXAccount } from '@services/oauth-x'
import {
  decryptOAuthAuthorizationCode,
  decryptOAuthAuthorizationPkceVerifier,
} from './authorization-broker.mts'
import {
  claimOAuthAuthorizationExchange,
  rejectExhaustedOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
} from './authorization-exchange-state.mts'

const PROVIDER_EXCHANGE_TIMEOUT_MS = 30_000
const X_PROVIDER_EXCHANGE_TIMEOUT_MS = 15_000

export {
  deleteExpiredOAuthAuthorizationBatch,
  getRecoverableOAuthAuthorizationIds,
} from './authorization-exchange-recovery.mts'

type OAuthAuthorizationExchangeDependencies = {
  claim: typeof claimOAuthAuthorizationExchange
  decryptCode: typeof decryptOAuthAuthorizationCode
  decryptVerifier: typeof decryptOAuthAuthorizationPkceVerifier
  upsertFacebook: typeof upsertFacebookAuthorizationCodeAccount
  upsertGithub: typeof upsertGithubAccount
  upsertX: typeof upsertXAccount
  rejectExhausted: typeof rejectExhaustedOAuthAuthorizationExchange
  releaseClaim: typeof releaseOAuthAuthorizationExchangeClaim
}

const defaultDependencies: OAuthAuthorizationExchangeDependencies = {
  claim: claimOAuthAuthorizationExchange,
  decryptCode: decryptOAuthAuthorizationCode,
  decryptVerifier: decryptOAuthAuthorizationPkceVerifier,
  upsertFacebook: upsertFacebookAuthorizationCodeAccount,
  upsertGithub: upsertGithubAccount,
  upsertX: upsertXAccount,
  rejectExhausted: rejectExhaustedOAuthAuthorizationExchange,
  releaseClaim: releaseOAuthAuthorizationExchangeClaim,
}

export async function processOAuthAuthorizationExchange(
  flowId: string,
  dependencies: OAuthAuthorizationExchangeDependencies = defaultDependencies,
): Promise<void> {
  const authorization = await dependencies.claim(flowId)
  if (!authorization) return

  try {
    const code = dependencies.decryptCode(authorization.id, authorization.callback_code_ciphertext)
    const providerExchangeTimeoutMs =
      authorization.provider === 'x' ? X_PROVIDER_EXCHANGE_TIMEOUT_MS : PROVIDER_EXCHANGE_TIMEOUT_MS
    const completionOptions = {
      authorizationId: authorization.id,
      authorizationClaimId: authorization.exchange_claim_id,
      signal: AbortSignal.timeout(providerExchangeTimeoutMs),
    }

    switch (authorization.provider) {
      case 'facebook':
        await dependencies.upsertFacebook(code, authorization.redirect_uri, completionOptions)
        return
      case 'x': {
        const codeVerifier = dependencies.decryptVerifier(
          authorization.id,
          authorization.pkce_verifier_ciphertext,
        )
        await dependencies.upsertX(
          code,
          authorization.redirect_uri,
          codeVerifier,
          completionOptions,
        )
        return
      }
      case 'github': {
        const codeVerifier = dependencies.decryptVerifier(
          authorization.id,
          authorization.pkce_verifier_ciphertext,
        )
        await dependencies.upsertGithub(code, authorization.redirect_uri, {
          codeVerifier,
          ...completionOptions,
        })
      }
    }
  } catch (error) {
    if (await dependencies.rejectExhausted(authorization.id, authorization.exchange_claim_id)) {
      return
    }
    await dependencies
      .releaseClaim(authorization.id, authorization.exchange_claim_id)
      .catch(releaseError => {
        const aggregateError = new AggregateError(
          [error, releaseError],
          'OAuth exchange failed and its durable claim could not be released',
        )
        aggregateError.cause = releaseError
        throw aggregateError
      })
    throw error
  }
}
