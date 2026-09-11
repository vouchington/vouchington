import { write } from '@data-stores/psql'
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
  const { rows } = await write(
    `/* claimOAuthAuthorizationExchange */ UPDATE oauth_authorizations
     SET status = 'exchanging',
         exchange_claim_id = $2,
         exchange_attempts = exchange_attempts + 1,
         exchange_started_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND expires_at > CURRENT_TIMESTAMP
       AND exchange_attempts < $4
       AND (
         provider <> 'x'
         OR callback_received_at >
           CURRENT_TIMESTAMP - make_interval(secs => $5)
       )
       AND (
         status = 'callback_received'
         OR (
           status = 'exchanging'
           AND updated_at < CURRENT_TIMESTAMP - make_interval(secs => $3)
         )
       )
     RETURNING
       id,
       provider,
       redirect_uri,
       callback_code_ciphertext,
       pkce_verifier_ciphertext,
       exchange_claim_id`,
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
    await rejectExpiredXAuthorizationCode(flowId)
    await expireOAuthAuthorization(flowId)
    return null
  }
  return authorization
}

export async function rejectExhaustedOAuthAuthorizationExchange(
  flowId: string,
  claimId: string,
): Promise<boolean> {
  const { rowCount } = await write(
    `/* rejectExhaustedOAuthAuthorizationExchange */ UPDATE oauth_authorizations
     SET status = 'rejected',
         callback_error = 'provider_exchange_failed',
         callback_code_ciphertext = NULL,
         exchange_claim_id = NULL
     WHERE id = $1
       AND status = 'exchanging'
       AND exchange_claim_id = $2
       AND exchange_attempts >= $3`,
    [flowId, claimId, MAX_EXCHANGE_ATTEMPTS],
  )
  return rowCount === 1
}

export async function releaseOAuthAuthorizationExchangeClaim(
  flowId: string,
  claimId: string,
): Promise<void> {
  await write(
    `/* releaseOAuthAuthorizationExchangeClaim */ UPDATE oauth_authorizations
     SET status = 'callback_received',
         exchange_claim_id = NULL
     WHERE id = $1
       AND status = 'exchanging'
       AND exchange_claim_id = $2`,
    [flowId, claimId],
  )
}

async function rejectExpiredXAuthorizationCode(flowId: string): Promise<void> {
  await write(
    `/* rejectExpiredXAuthorizationCode */ UPDATE oauth_authorizations
     SET status = 'rejected',
         callback_error = 'provider_code_expired',
         callback_code_ciphertext = NULL,
         exchange_claim_id = NULL
     WHERE id = $1
       AND provider = 'x'
       AND (
         status = 'callback_received'
         OR (
           status = 'exchanging'
           AND updated_at < CURRENT_TIMESTAMP - make_interval(secs => $3)
         )
       )
       AND callback_received_at <=
         CURRENT_TIMESTAMP - make_interval(secs => $2)`,
    [flowId, X_MAX_QUEUE_DELAY_SECONDS, STALE_EXCHANGE_CLAIM_SECONDS],
  )
}

async function expireOAuthAuthorization(flowId: string): Promise<void> {
  await write(
    `/* expireOAuthAuthorization */ UPDATE oauth_authorizations
     SET status = 'expired',
         callback_code_ciphertext = NULL,
         completion_token_ciphertext = NULL,
         exchange_claim_id = NULL
     WHERE id = $1
       AND expires_at <= CURRENT_TIMESTAMP
       AND status IN ('pending', 'callback_received', 'exchanging', 'completion_ready')`,
    [flowId],
  )
}
