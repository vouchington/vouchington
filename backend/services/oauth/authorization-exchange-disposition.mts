import { beginTransaction } from '@data-stores/psql'
import {
  MAX_EXCHANGE_ATTEMPTS,
  X_MAX_QUEUE_DELAY_SECONDS,
} from './authorization-exchange-state.mts'

export type OAuthExchangeDisposition = 'released' | 'terminal' | 'superseded' | 'missing'

/** Resume only the recorded claim; completed rows and successor claims are never mutated. */
export async function settleOAuthAuthorizationExchangeClaim(
  authorizationId: string,
  claimId: string,
  providerRequestArmed = false,
): Promise<OAuthExchangeDisposition> {
  await using transaction = await beginTransaction()
  await transaction(
    '/* settleOAuthAuthorizationExchangeClaim:isolation */ SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
  )
  await transaction(
    '/* settleOAuthAuthorizationExchangeClaim:lock */ SELECT id FROM oauth_authorizations WHERE id = $1 FOR UPDATE NOWAIT',
    [authorizationId],
  )
  const { rows } = await transaction<{
    status: string
    exchange_claim_id: string | null
    exchange_attempts: number
    authorization_expired: boolean
    provider_code_expired: boolean
  }>(
    `/* settleOAuthAuthorizationExchangeClaim:history */ SELECT status, exchange_claim_id, exchange_attempts,
       expires_at <= CURRENT_TIMESTAMP AS authorization_expired,
       provider = 'x' AND callback_received_at <= CURRENT_TIMESTAMP - make_interval(secs => $2)
         AS provider_code_expired
     FROM view_oauth_authorization_current_records WHERE id = $1`,
    [authorizationId, X_MAX_QUEUE_DELAY_SECONDS],
  )
  const current = rows[0]
  let disposition: OAuthExchangeDisposition
  if (!current) disposition = 'missing'
  else if (['completion_ready', 'completed', 'rejected', 'expired'].includes(current.status))
    disposition = 'terminal'
  else if (current.exchange_claim_id === null && current.status === 'callback_received')
    disposition = 'released'
  else if (current.exchange_claim_id !== claimId) disposition = 'superseded'
  else {
    const expired = current.authorization_expired
    const codeExpired = !expired && current.provider_code_expired
    const exhausted = !expired && !codeExpired && current.exchange_attempts >= MAX_EXCHANGE_ATTEMPTS
    const outcomeUnknown = !expired && !codeExpired && !exhausted && providerRequestArmed
    const terminal = expired || codeExpired || exhausted || outcomeUnknown
    const { rowCount } = await transaction(
      `/* settleOAuthAuthorizationExchangeClaim:dispose */ UPDATE oauth_authorizations
       SET exchange_claim_id = NULL,
           expired_at = CASE WHEN $3 THEN COALESCE(expired_at, clock_timestamp()) ELSE expired_at END,
           rejected_at = CASE WHEN $4 OR $5 OR $6 THEN COALESCE(rejected_at, clock_timestamp()) ELSE rejected_at END,
           callback_error = CASE WHEN $4 THEN 'provider_code_expired'
             WHEN $5 THEN 'provider_exchange_failed'
             WHEN $6 THEN 'provider_exchange_outcome_unknown' ELSE callback_error END,
           callback_code_ciphertext = CASE WHEN $3 OR $4 OR $5 OR $6 THEN NULL ELSE callback_code_ciphertext END,
           completion_token_ciphertext = CASE WHEN $3 THEN NULL ELSE completion_token_ciphertext END
       WHERE id = $1 AND exchange_claim_id = $2 AND status = 'callback_received'`,
      [authorizationId, claimId, expired, codeExpired, exhausted, outcomeUnknown],
    )
    if (rowCount !== 1)
      throw new Error('Owned OAuth exchange disposition did not update exactly one authorization')
    disposition = terminal ? 'terminal' : 'released'
  }
  await transaction.commit()
  return disposition
}
