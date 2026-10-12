import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import type { BrokerOAuthProvider } from './broker-config.mts'

export const STALE_EXCHANGE_CLAIM_SECONDS = 60
export const X_MAX_QUEUE_DELAY_SECONDS = 10
export const MAX_EXCHANGE_ATTEMPTS = 5

export type ClaimedOAuthAuthorization = {
  id: string
  provider: BrokerOAuthProvider
  redirect_uri: string
  callback_code_ciphertext: string
  pkce_verifier_ciphertext: string
  exchange_claim_id: string
}

export async function claimOAuthAuthorizationExchange(
  flowId: string,
): Promise<ClaimedOAuthAuthorization | null> {
  const claimId = uuidv7()
  return withLockedOAuthAuthorization(flowId, async transaction => {
    const { rows } = await transaction(
      `/* claimOAuthAuthorizationExchange */ WITH candidate AS (
       SELECT id, exchange_claim_id, updated_at
       FROM view_oauth_authorization_current_records
       WHERE id = $1 AND expires_at > clock_timestamp() AND exchange_attempts < $4
         AND (provider <> 'x' OR callback_received_at > clock_timestamp() - make_interval(secs => $5))
         AND (status = 'callback_received' OR
           (status = 'exchanging' AND exchange_started_at < clock_timestamp() - make_interval(secs => $3)))
       FOR UPDATE
     )
     UPDATE oauth_authorizations flow
     SET exchange_claim_id = $2,
         exchange_started_at = COALESCE(flow.exchange_started_at, clock_timestamp())
     FROM candidate
     WHERE flow.id = candidate.id AND flow.status = 'callback_received'
       AND flow.updated_at = candidate.updated_at
       AND flow.exchange_claim_id IS NOT DISTINCT FROM candidate.exchange_claim_id
     RETURNING flow.id, flow.provider, flow.redirect_uri,
       flow.callback_code_ciphertext, flow.pkce_verifier_ciphertext, flow.exchange_claim_id`,
      [
        flowId,
        claimId,
        STALE_EXCHANGE_CLAIM_SECONDS,
        MAX_EXCHANGE_ATTEMPTS,
        X_MAX_QUEUE_DELAY_SECONDS,
      ],
    )
    const authorization = rows[0] as ClaimedOAuthAuthorization | undefined
    if (!authorization) {
      // Expiry must settle even a claim whose queue ownership write never succeeded.
      await expireOAuthAuthorization(transaction, flowId)
      await rejectExpiredXAuthorizationCode(transaction, flowId)
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

export async function rejectExhaustedOAuthAuthorizationExchange(
  flowId: string,
  claimId: string,
): Promise<boolean> {
  return withLockedOAuthAuthorization(flowId, async transaction => {
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
  await withLockedOAuthAuthorization(flowId, async transaction => {
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

async function rejectExpiredXAuthorizationCode(
  transaction: OwnedTransaction,
  flowId: string,
): Promise<void> {
  await transaction(
    `/* rejectExpiredXAuthorizationCode */ UPDATE oauth_authorizations
     SET rejected_at = COALESCE(rejected_at, clock_timestamp()),
         callback_error = 'provider_code_expired',
         callback_code_ciphertext = NULL,
         exchange_claim_id = NULL
     WHERE id = $1
       AND provider = 'x'
       AND status = 'callback_received'
       AND (exchange_claim_id IS NULL OR EXISTS (
         SELECT 1 FROM oauth_authorization_exchange_attempts attempt
         WHERE attempt.oauth_authorization_id = oauth_authorizations.id
           AND attempt.exchange_claim_id = oauth_authorizations.exchange_claim_id
           AND attempt.started_at < clock_timestamp() - make_interval(secs => $3)
       ))
       AND callback_received_at <=
         CURRENT_TIMESTAMP - make_interval(secs => $2)`,
    [flowId, X_MAX_QUEUE_DELAY_SECONDS, STALE_EXCHANGE_CLAIM_SECONDS],
  )
}

async function expireOAuthAuthorization(
  transaction: OwnedTransaction,
  flowId: string,
): Promise<void> {
  await transaction(
    `/* expireOAuthAuthorization */ UPDATE oauth_authorizations
     SET expired_at = CASE WHEN rejected_at IS NULL THEN COALESCE(expired_at, clock_timestamp()) ELSE expired_at END,
         callback_code_ciphertext = NULL,
         completion_token_ciphertext = NULL,
         exchange_claim_id = NULL
     WHERE id = $1
       AND expires_at <= CURRENT_TIMESTAMP
       AND status IN ('pending', 'callback_received', 'exchanging', 'completion_ready')`,
    [flowId],
  )
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
