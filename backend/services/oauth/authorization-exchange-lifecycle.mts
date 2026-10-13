import type { OwnedTransaction } from '@data-stores/psql'
import { rejectStaleOAuthAuthorizationExchangeSql } from './authorization-exchange-stale-sql.mts'

/** Expire first, then fence unknown stale claims before a new authoritative claim statement. */
export async function prepareOAuthAuthorizationClaim(
  transaction: OwnedTransaction,
  flowId: string,
  staleClaimSeconds: number,
  maxQueueDelaySeconds: number,
): Promise<void> {
  await expireOAuthAuthorization(transaction, flowId)
  await transaction(rejectStaleOAuthAuthorizationExchangeSql, [
    flowId,
    staleClaimSeconds,
    maxQueueDelaySeconds,
  ])
}

/** Settle authorization and provider-code expiry before reading admission/history authority. */
export async function settleOAuthAuthorizationExpiry(
  transaction: OwnedTransaction,
  flowId: string,
  maxQueueDelaySeconds: number,
  staleClaimSeconds: number,
): Promise<void> {
  await expireOAuthAuthorization(transaction, flowId)
  await rejectExpiredXAuthorizationCode(
    transaction,
    flowId,
    maxQueueDelaySeconds,
    staleClaimSeconds,
  )
}

async function rejectExpiredXAuthorizationCode(
  transaction: OwnedTransaction,
  flowId: string,
  maxQueueDelaySeconds: number,
  staleClaimSeconds: number,
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
    [flowId, maxQueueDelaySeconds, staleClaimSeconds],
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
