import type { OAuthAuthorizationExchangeDependencies } from '../services/oauth/authorization-exchange.mts'
import type { ownOAuthActors } from './oauth-exchange-actor-owner.mts'
import type { OAuthContinuationFault } from './oauth-exchange-continuation.mts'
import {
  claimOAuthAuthorizationExchange,
  validateOAuthAuthorizationExchangeClaim,
  rejectExhaustedOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
} from '../services/oauth/authorization-exchange-state.mts'
import {
  decryptOAuthAuthorizationCode,
  decryptOAuthAuthorizationPkceVerifier,
} from '../services/oauth/authorization-broker.mts'
import { upsertFacebookAuthorizationCodeAccount } from '../services/oauth-facebook/index.mts'
import { upsertGithubAccount } from '../services/oauth-github/index.mts'
import { upsertXAccount } from '../services/oauth-x/index.mts'

export type OAuthContinuationMetrics = {
  decryptCalls: number
  providerCalls: number
  primary: unknown
  faultUsed: boolean
}

/** Actual declared production dependencies, with owned admission fencing and existing native fault boundaries. */
export function createTestOAuthContinuationDependencies(
  owner: ReturnType<typeof ownOAuthActors>,
  fault: OAuthContinuationFault,
  lock: () => Promise<void>,
  metrics: OAuthContinuationMetrics,
): OAuthAuthorizationExchangeDependencies {
  return {
    validateClaim: (id, claim) =>
      owner.run(() => validateOAuthAuthorizationExchangeClaim(id, claim)),
    claim: id => owner.run(() => claimOAuthAuthorizationExchange(id)),
    decryptCode(id, ciphertext) {
      owner.assertOpen()
      metrics.decryptCalls += 1
      try {
        return decryptOAuthAuthorizationCode(id, ciphertext)
      } catch (err) {
        metrics.primary = err
        throw err
      }
    },
    decryptVerifier(id, ciphertext) {
      owner.assertOpen()
      return decryptOAuthAuthorizationPkceVerifier(id, ciphertext)
    },
    upsertFacebook(...args) {
      metrics.providerCalls += 1
      return owner.run(() => upsertFacebookAuthorizationCodeAccount(...args))
    },
    upsertGithub(...args) {
      metrics.providerCalls += 1
      return owner.run(() => upsertGithubAccount(...args))
    },
    upsertX(...args) {
      metrics.providerCalls += 1
      return owner.run(() => upsertXAccount(...args))
    },
    async rejectExhausted(id, claimId) {
      if (fault === 'rejection' && !metrics.faultUsed) {
        metrics.faultUsed = true
        await lock()
      }
      const rejected = await owner.run(() => rejectExhaustedOAuthAuthorizationExchange(id, claimId))
      if (fault === 'release' && !metrics.faultUsed) {
        metrics.faultUsed = true
        await lock()
      }
      return rejected
    },
    releaseClaim: (id, claim) => owner.run(() => releaseOAuthAuthorizationExchangeClaim(id, claim)),
  }
}
