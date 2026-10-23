import {
  prepareOAuthAuthorizationClaim,
  settleOAuthAuthorizationExpiry,
} from './authorization-exchange-lifecycle.mts'
import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import type { BrokerOAuthProvider, BrokerPurpose } from './broker-config.mts'

export const STALE_EXCHANGE_CLAIM_SECONDS = 60
export const X_MAX_QUEUE_DELAY_SECONDS = 10
export const MAX_EXCHANGE_ATTEMPTS = 5

export type ClaimedOAuthAuthorization = {
  id: string
  provider: BrokerOAuthProvider
  purpose: BrokerPurpose
  initiating_user_id: string | null
  initiating_device_id: string
  initiating_session_id: string
  redirect_uri: string
  callback_code_ciphertext: string
  pkce_verifier_ciphertext: string
  exchange_claim_id: string
}

export async function claimOAuthAuthorizationExchange(
  flowId: string,
): Promise<ClaimedOAuthAuthorization | null> {
  const claimId = uuidv7()
  return withLockedOAuthAuthorization(flowId, async (transaction: OwnedTransaction) => {
    await prepareOAuthAuthorizationClaim(
      transaction,
      flowId,
      STALE_EXCHANGE_CLAIM_SECONDS,
      X_MAX_QUEUE_DELAY_SECONDS,
    )
    const { rows } = await transaction(
      `/* claimOAuthAuthorizationExchange */ WITH candidate AS (
       SELECT id, exchange_claim_id, updated_at
       FROM view_oauth_authorization_current_records
       WHERE id = $1 AND expires_at > clock_timestamp() AND exchange_attempts < $3
         AND (provider <> 'x' OR callback_received_at > clock_timestamp() - make_interval(secs => $4))
         AND status = 'callback_received'
       FOR UPDATE
     )
     UPDATE oauth_authorizations flow
     SET exchange_claim_id = $2,
         exchange_started_at = COALESCE(flow.exchange_started_at, clock_timestamp())
     FROM candidate
     WHERE flow.id = candidate.id AND flow.status = 'callback_received'
       AND flow.updated_at = candidate.updated_at
       AND flow.exchange_claim_id IS NOT DISTINCT FROM candidate.exchange_claim_id
     RETURNING flow.id, flow.provider, flow.purpose, flow.initiating_user_id,
       flow.initiating_device_id, flow.initiating_session_id, flow.redirect_uri,
       flow.callback_code_ciphertext, flow.pkce_verifier_ciphertext, flow.exchange_claim_id`,
      [flowId, claimId, MAX_EXCHANGE_ATTEMPTS, X_MAX_QUEUE_DELAY_SECONDS],
    )
    const authorization = rows[0] as ClaimedOAuthAuthorization | undefined
    if (!authorization) {
      // Expiry must settle even a claim whose queue ownership write never succeeded.
      await settleOAuthAuthorizationExpiry(
        transaction,
        flowId,
        X_MAX_QUEUE_DELAY_SECONDS,
        STALE_EXCHANGE_CLAIM_SECONDS,
      )
      const { rows: current } = await transaction<{ status: string }>(
        '/* claimOAuthAuthorizationExchange:unclaimed */ SELECT status FROM view_oauth_authorization_current_records WHERE id = $1',
        [flowId],
      )
      if (current[0]?.status === 'exchanging') {
        throw new Error('OAuth authorization has an unresolved exchange claim')
      }
      return null
    }
    return authorization
  })
}

/** Fresh authority after queue persistence; stale, expired or superseded claims cannot admit a provider. */
export async function validateOAuthAuthorizationExchangeClaim(
  flowId: string,
  claimId: string,
): Promise<void> {
  const valid = await withLockedOAuthAuthorization(
    flowId,
    async (transaction: OwnedTransaction) => {
      await settleOAuthAuthorizationExpiry(
        transaction,
        flowId,
        X_MAX_QUEUE_DELAY_SECONDS,
        STALE_EXCHANGE_CLAIM_SECONDS,
      )
      const { rows } = await transaction<{ id: string }>(
        `/* validateOAuthAuthorizationExchangeClaim */ SELECT id
       FROM view_oauth_authorization_current_records
       WHERE id = $1 AND status = 'exchanging' AND exchange_claim_id = $2
         AND expires_at > clock_timestamp()
         AND exchange_started_at >= clock_timestamp() - make_interval(secs => $3)
         AND (provider <> 'x' OR callback_received_at > clock_timestamp() - make_interval(secs => $4))`,
        [flowId, claimId, STALE_EXCHANGE_CLAIM_SECONDS, X_MAX_QUEUE_DELAY_SECONDS],
      )
      return rows.length === 1
    },
  )
  if (!valid) throw new Error('OAuth provider admission lost its current unexpired claim')
}

export async function rejectExhaustedOAuthAuthorizationExchange(
  flowId: string,
  claimId: string,
): Promise<boolean> {
  return withLockedOAuthAuthorization(flowId, async (transaction: OwnedTransaction) => {
    const { rowCount } = await transaction(
      `/* rejectExhaustedOAuthAuthorizationExchange */ UPDATE oauth_authorizations
     SET rejected_at = COALESCE(rejected_at, clock_timestamp()),
         callback_error = 'provider_exchange_failed',
         callback_code_ciphertext = NULL,
         exchange_claim_id = NULL
     WHERE id = $1
       AND status = 'callback_received'
       AND exchange_claim_id = $2
       AND (SELECT MAX(attempt_number) FROM oauth_authorization_exchange_attempts
         WHERE oauth_authorization_id = oauth_authorizations.id) >= $3`,
      [flowId, claimId, MAX_EXCHANGE_ATTEMPTS],
    )
    return rowCount === 1
  })
}

export async function releaseOAuthAuthorizationExchangeClaim(
  flowId: string,
  claimId: string,
): Promise<void> {
  await withLockedOAuthAuthorization(flowId, async (transaction: OwnedTransaction) => {
    await transaction(
      `/* releaseOAuthAuthorizationExchangeClaim */ UPDATE oauth_authorizations
     SET exchange_claim_id = NULL
     WHERE id = $1
       AND status = 'callback_received'
       AND exchange_claim_id = $2`,
      [flowId, claimId],
    )
  })
}

/** Own row identity before reading projected attempt history; never borrow a caller executor. */
async function withLockedOAuthAuthorization<Result>(
  flowId: string,
  run: (transaction: OwnedTransaction) => Promise<Result>,
): Promise<Result> {
  await using transaction = await beginTransaction()
  await lockOAuthAuthorizationForMutation(transaction, flowId)
  const result = await run(transaction)
  await transaction.commit()
  return result
}

/** Establish isolation and acquire the authorization row before authoritative reads. */
async function lockOAuthAuthorizationForMutation(
  transaction: OwnedTransaction,
  flowId: string,
): Promise<void> {
  await transaction(
    '/* withLockedOAuthAuthorization:isolation */ SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
  )
  await transaction(
    '/* withLockedOAuthAuthorization:lock */ SELECT id FROM oauth_authorizations WHERE id = $1 FOR UPDATE NOWAIT',
    [flowId],
  )
}
