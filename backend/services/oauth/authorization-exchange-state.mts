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
    `/* claimOAuthAuthorizationExchange */ WITH candidate AS (
       SELECT id, exchange_claim_id, updated_at
       FROM oauth_authorization_current_records
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
}

export async function releaseOAuthAuthorizationExchangeClaim(
  flowId: string,
  claimId: string,
): Promise<void> {
  await write(
    `/* releaseOAuthAuthorizationExchangeClaim */ UPDATE oauth_authorizations
     SET exchange_claim_id = NULL
     WHERE id = $1
       AND status = 'callback_received'
       AND exchange_claim_id = $2`,
    [flowId, claimId],
  )
}

async function rejectExpiredXAuthorizationCode(flowId: string): Promise<void> {
  await write(
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

async function expireOAuthAuthorization(flowId: string): Promise<void> {
  await write(
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
