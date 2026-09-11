import { randomUUID } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { IneligiblePurchaseReversalInProgressError } from '../ineligible-stripe-purchase-reversal-execution.mts'

const EXECUTION_CLAIM_TTL_SECONDS = 300

export async function claimIneligiblePurchaseReversalExecution(
  id: string,
  query: QueryExecutor,
): Promise<string> {
  const executionClaimToken = randomUUID()
  const { rows } = await query(sql`/* claimIneligiblePurchaseReversalExecution */
    UPDATE membership_operations
    SET execution_claim_token = ${executionClaimToken}, execution_claimed_at = CURRENT_TIMESTAMP,
      failed_at = NULL, failure_message = NULL
    WHERE id = ${id} AND completed_at IS NULL
      AND (
        execution_claim_token IS NULL
        OR execution_claimed_at < CURRENT_TIMESTAMP - make_interval(secs => ${EXECUTION_CLAIM_TTL_SECONDS})
      )
    RETURNING id
  `)
  if (rows.length === 0) throw new IneligiblePurchaseReversalInProgressError(id)
  return executionClaimToken
}
