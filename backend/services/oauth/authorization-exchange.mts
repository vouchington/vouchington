import { exchangeClaimedOAuthAuthorization } from './authorization-exchange-provider.mts'
import { settleOAuthAuthorizationExchangeClaim } from './authorization-exchange-disposition.mts'
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
  validateOAuthAuthorizationExchangeClaim,
} from './authorization-exchange-state.mts'

const PROVIDER_EXCHANGE_TIMEOUT_MS = 30_000
const X_PROVIDER_EXCHANGE_TIMEOUT_MS = 15_000

export {
  deleteExpiredOAuthAuthorizationBatch,
  getRecoverableOAuthAuthorizationIds,
} from './authorization-exchange-recovery.mts'

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

const defaultDependencies: OAuthAuthorizationExchangeDependencies = {
  validateClaim: validateOAuthAuthorizationExchangeClaim,
  claim: claimOAuthAuthorizationExchange,
  decryptCode: decryptOAuthAuthorizationCode,
  decryptVerifier: decryptOAuthAuthorizationPkceVerifier,
  upsertFacebook: upsertFacebookAuthorizationCodeAccount,
  upsertGithub: upsertGithubAccount,
  upsertX: upsertXAccount,
  rejectExhausted: rejectExhaustedOAuthAuthorizationExchange,
  releaseClaim: releaseOAuthAuthorizationExchangeClaim,
}

export type OAuthExchangeOwnership = {
  claimId?: string
  providerRequestArmed?: boolean
  persist(claimId: string | null, providerRequestArmed?: boolean): Promise<void>
}

export async function processOAuthAuthorizationExchange(
  flowId: string,
  dependencies: OAuthAuthorizationExchangeDependencies = defaultDependencies,
  ownership?: OAuthExchangeOwnership,
): Promise<void> {
  if (ownership?.claimId) {
    const disposition = await settleOAuthAuthorizationExchangeClaim(
      flowId,
      ownership.claimId,
      ownership.providerRequestArmed,
    )
    await ownership.persist(null)
    if (disposition === 'terminal' || disposition === 'missing' || ownership.providerRequestArmed)
      return
    throw new Error(
      `OAuth exchange continuation disposed as ${disposition}; provider was not replayed`,
    )
  }
  const authorization = await dependencies.claim(flowId)
  if (!authorization) return
  // The deadline includes both ownership writes; resuming a stalled write cannot restart it.
  const signal = AbortSignal.timeout(
    authorization.provider === 'x' ? X_PROVIDER_EXCHANGE_TIMEOUT_MS : PROVIDER_EXCHANGE_TIMEOUT_MS,
  )
  // This write precedes decrypt/provider execution. If it fails, no provider is called.
  try {
    await ownership?.persist(authorization.exchange_claim_id)
  } catch (outerErr) {
    // No provider was admitted, even if the queue write committed before its response failed.
    try {
      const rejected = await dependencies.rejectExhausted(
        authorization.id,
        authorization.exchange_claim_id,
      )
      if (!rejected)
        await dependencies.releaseClaim(authorization.id, authorization.exchange_claim_id)
    } catch (err) {
      const aggregateError = new AggregateError(
        [outerErr, err],
        'OAuth ownership could not be persisted and its unused claim could not be released',
        { cause: outerErr },
      )
      throw aggregateError
    }
    throw outerErr
  }

  const admission = { armed: false }
  try {
    await exchangeClaimedOAuthAuthorization(
      authorization,
      dependencies,
      ownership,
      admission,
      signal,
    )
  } catch (outerErr) {
    // Retain durable armed ownership: a provider exception may follow external success.
    // The next owned continuation establishes the terminal unknown outcome.
    if (admission.armed) throw outerErr
    let rejected: boolean
    try {
      rejected = await dependencies.rejectExhausted(
        authorization.id,
        authorization.exchange_claim_id,
      )
    } catch (err) {
      // Rejection did not establish a durable outcome: do not attempt a second state mutation.
      const aggregateError = new AggregateError(
        [outerErr, err],
        'OAuth exchange failed and its durable rejection could not be established',
        { cause: outerErr },
      )
      throw aggregateError
    }
    if (rejected) {
      try {
        await ownership?.persist(null)
      } catch (err) {
        const aggregateError = new AggregateError(
          [outerErr, err],
          'OAuth exchange was rejected but ownership could not be cleared',
          { cause: outerErr },
        )
        throw aggregateError
      }
      return
    }
    await dependencies
      .releaseClaim(authorization.id, authorization.exchange_claim_id)
      .catch(err => {
        const aggregateError = new AggregateError(
          [outerErr, err],
          'OAuth exchange failed and its durable claim could not be released',
          { cause: outerErr },
        )
        throw aggregateError
      })
    try {
      await ownership?.persist(null)
    } catch (err) {
      const aggregateError = new AggregateError(
        [outerErr, err],
        'OAuth claim was released but ownership could not be cleared',
        { cause: outerErr },
      )
      throw aggregateError
    }
    throw outerErr
  }
  await ownership?.persist(null)
}
