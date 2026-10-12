import { beginTransaction } from '@data-stores/psql'
import { MAX_EXCHANGE_ATTEMPTS } from './authorization-exchange-state.mts'

export type OAuthExchangeDisposition = 'released' | 'terminal' | 'superseded' | 'missing'

/** Resume only the recorded claim; completed rows and successor claims are never mutated. */
export async function settleOAuthAuthorizationExchangeClaim(
  authorizationId: string,
  claimId: string,
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
  }>(
    '/* settleOAuthAuthorizationExchangeClaim:history */ SELECT status, exchange_claim_id, exchange_attempts FROM view_oauth_authorization_current_records WHERE id = $1',
    [authorizationId],
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
    const exhausted = current.exchange_attempts >= MAX_EXCHANGE_ATTEMPTS
    const { rowCount } = await transaction(
      `/* settleOAuthAuthorizationExchangeClaim:dispose */ UPDATE oauth_authorizations
       SET exchange_claim_id = NULL,
           rejected_at = CASE WHEN $3 THEN COALESCE(rejected_at, clock_timestamp()) ELSE rejected_at END,
           callback_error = CASE WHEN $3 THEN 'provider_exchange_failed' ELSE callback_error END,
           callback_code_ciphertext = CASE WHEN $3 THEN NULL ELSE callback_code_ciphertext END
       WHERE id = $1 AND exchange_claim_id = $2 AND status = 'callback_received'`,
      [authorizationId, claimId, exhausted],
    )
    if (rowCount !== 1)
      throw new Error('Owned OAuth exchange disposition did not update exactly one authorization')
    disposition = exhausted ? 'terminal' : 'released'
  }
  await transaction.commit()
  return disposition
}
