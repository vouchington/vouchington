import { beginTransaction } from '@data-stores/psql'
import { upsertFacebookAuthorizationCodeAccount } from '../services/oauth-facebook/index.mts'
import { upsertGithubAccount } from '../services/oauth-github/index.mts'
import { upsertLinkedInAccount } from '../services/oauth-linkedin/index.mts'
import { upsertXAccount } from '../services/oauth-x/index.mts'
import { processOAuthAuthorizationExchange } from '../services/oauth/authorization-exchange.mts'
import {
  decryptOAuthAuthorizationCode,
  decryptOAuthAuthorizationPkceVerifier,
} from '../services/oauth/authorization-broker.mts'
import {
  claimOAuthAuthorizationExchange,
  validateOAuthAuthorizationExchangeClaim,
  rejectExhaustedOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
} from '../services/oauth/authorization-exchange-state.mts'

/** All delegates call real production functions; the fault is a real second-connection row lock. */
export async function captureTestOAuthExchangeMutationFailure(
  authorizationId: string,
  boundary: 'rejection' | 'release',
) {
  await using holder = await beginTransaction()
  let primary: unknown
  let secondary: unknown
  let error: unknown
  let hasFailed = false
  let releaseCalls = 0
  let claimId: string | undefined
  const lock = async () => {
    await holder(
      '/* captureTestOAuthExchangeMutationFailure:lock */ SELECT id FROM oauth_authorizations WHERE id = $1 FOR UPDATE NOWAIT',
      [authorizationId],
    )
  }
  try {
    await processOAuthAuthorizationExchange(authorizationId, {
      validateClaim: validateOAuthAuthorizationExchangeClaim,
      async claim(id) {
        const claimed = await claimOAuthAuthorizationExchange(id)
        if (claimed) {
          claimId = claimed.exchange_claim_id
          if (boundary === 'rejection') await lock()
        }
        return claimed
      },
      decryptCode(id, ciphertext) {
        try {
          return decryptOAuthAuthorizationCode(id, ciphertext)
        } catch (err) {
          primary = err
          throw err
        }
      },
      decryptVerifier: decryptOAuthAuthorizationPkceVerifier,
      upsertFacebook: upsertFacebookAuthorizationCodeAccount,
      upsertGithub: upsertGithubAccount,
      upsertLinkedIn: upsertLinkedInAccount,
      upsertX: upsertXAccount,
      async rejectExhausted(id, claimedId) {
        let rejected: boolean
        try {
          rejected = await rejectExhaustedOAuthAuthorizationExchange(id, claimedId)
        } catch (err) {
          secondary = err
          throw err
        }
        if (!rejected && boundary === 'release') await lock()
        return rejected
      },
      async releaseClaim(id, claimedId) {
        releaseCalls += 1
        try {
          await releaseOAuthAuthorizationExchangeClaim(id, claimedId)
        } catch (err) {
          secondary = err
          throw err
        }
      },
    })
  } catch (err) {
    hasFailed = true
    error = err
  }
  // Await-using rollback completes before this result is returned to the test.
  return { hasFailed, error, primary, secondary, releaseCalls, claimId }
}
