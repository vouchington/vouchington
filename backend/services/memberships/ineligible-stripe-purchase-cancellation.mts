import { randomUUID } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createIneligiblePurchaseCancellationIdempotencyKey } from './ineligible-stripe-purchase-reversal-idempotency.mts'
import { IneligiblePurchaseReversalInProgressError } from './ineligible-stripe-purchase-reversal-execution.mts'
import type { ClaimedCancellation } from './ineligible-stripe-purchase-reversal-types.mts'

const EXECUTION_CLAIM_TTL_SECONDS = 300

export async function claimIneligiblePurchaseCancellationOperation(
  membershipSourceId: string,
  membershipLineageBindingId: string,
  membershipProviderLineageId: string,
  providerEnvironment: 'test' | 'production',
  providerApplicationId: string,
  subscriptionId: string,
  query: QueryExecutor,
): Promise<ClaimedCancellation> {
  const idempotencyKey = createIneligiblePurchaseCancellationIdempotencyKey(
    providerEnvironment,
    providerApplicationId,
    subscriptionId,
  )
  await query(sql`/* claimIneligiblePurchaseCancellation:insert */
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      provider, environment, application_id,
      operation_kind, idempotency_key
    ) VALUES (
      ${membershipSourceId}, ${membershipProviderLineageId}, ${membershipLineageBindingId},
      'stripe', ${providerEnvironment}, ${providerApplicationId},
      'cancel_source', ${idempotencyKey}
    ) ON CONFLICT (provider, environment, application_id, idempotency_key) DO NOTHING
  `)
  const { rows } = await query(sql`/* claimIneligiblePurchaseCancellation:lock */
    SELECT operation.id, operation.completed_at IS NOT NULL AS completed,
      operation.execution_claim_token AS "executionClaimToken",
      operation.execution_claimed_at AS "executionClaimedAt"
    FROM membership_operations operation
    WHERE operation.provider = 'stripe' AND operation.environment = ${providerEnvironment}
      AND operation.application_id = ${providerApplicationId} AND operation.idempotency_key = ${idempotencyKey}
      AND operation.membership_lineage_binding_id = ${membershipLineageBindingId}
    FOR UPDATE
  `)
  const row = rows[0] as
    | {
        completed: boolean
        executionClaimToken: string | null
        executionClaimedAt: Date | null
        id: string
      }
    | undefined
  if (!row) throw new Error(`Could not claim Stripe cancellation ${idempotencyKey}`)
  if (row.completed) {
    return { completed: true, executionClaimToken: null, id: row.id, idempotencyKey }
  }
  const executionClaimToken = randomUUID()
  const { rows: claimedRows } = await query(sql`/* claimIneligiblePurchaseCancellation:execution */
    UPDATE membership_operations
    SET execution_claim_token = ${executionClaimToken}, execution_claimed_at = CURRENT_TIMESTAMP,
      failed_at = NULL, failure_message = NULL
    WHERE id = ${row.id} AND completed_at IS NULL
      AND (
        execution_claim_token IS NULL
        OR execution_claimed_at < CURRENT_TIMESTAMP - make_interval(secs => ${EXECUTION_CLAIM_TTL_SECONDS})
      )
    RETURNING id
  `)
  if (claimedRows.length === 0) throw new IneligiblePurchaseReversalInProgressError(row.id)
  return { completed: false, executionClaimToken, id: row.id, idempotencyKey }
}
