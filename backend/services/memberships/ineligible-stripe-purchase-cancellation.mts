import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getOrCreateProviderContextId } from './provider-context.mts'
import { createIneligiblePurchaseCancellationIdempotencyKey } from './ineligible-stripe-purchase-reversal-idempotency.mts'
import { IneligiblePurchaseReversalInProgressError } from './ineligible-stripe-purchase-reversal-execution.mts'
import type { ClaimedCancellation } from './ineligible-stripe-purchase-reversal-types.mts'

import { claimMembershipOperationExecutionWork } from './operation-execution-work.mts'

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
  // ast-grep-ignore: no-three-sequential-awaits -- the context must exist before the operation insert, which must precede the locked claim reread
  const providerContextId = await getOrCreateProviderContextId(
    { provider: 'stripe', environment: providerEnvironment, applicationId: providerApplicationId },
    query,
  )
  await query(sql`/* serializeRetainedCancellationIdentity */
    SELECT pg_advisory_xact_lock(hashtextextended(
      ${`membership-operation:${providerContextId}:${idempotencyKey}`}, 0))`)
  const { rows: retained } = await query<{ id: string }>(sql`
    /* getRetainedIneligiblePurchaseCancellation */
    SELECT id FROM membership_operation_retained_identities
    WHERE membership_provider_context_id = ${providerContextId}
      AND idempotency_key = ${idempotencyKey}
      AND operation_kind = 'cancel_source'
      AND membership_lineage_binding_id = ${membershipLineageBindingId}`)
  if (retained[0]) return { completed: true, leaseToken: null, id: retained[0].id, idempotencyKey }
  await query(sql`/* claimIneligiblePurchaseCancellation:insert */
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      membership_provider_context_id,
      operation_kind, idempotency_key
    ) VALUES (
      ${membershipSourceId}, ${membershipProviderLineageId}, ${membershipLineageBindingId},
      ${providerContextId},
      'cancel_source', ${idempotencyKey}
    ) ON CONFLICT (membership_provider_context_id, idempotency_key) DO NOTHING
  `)
  const { rows } = await query(sql`/* claimIneligiblePurchaseCancellation:lock */
    SELECT operation.id, operation.completed_at IS NOT NULL AS completed
    FROM membership_operations operation
    WHERE operation.membership_provider_context_id = ${providerContextId}::UUID AND operation.idempotency_key = ${idempotencyKey}
      AND operation.membership_lineage_binding_id = ${membershipLineageBindingId}
    FOR UPDATE
  `)
  const row = rows[0] as
    | {
        completed: boolean
        id: string
      }
    | undefined
  if (!row) throw new Error(`Could not claim Stripe cancellation ${idempotencyKey}`)
  if (row.completed) {
    return { completed: true, leaseToken: null, id: row.id, idempotencyKey }
  }
  const leaseToken = await claimMembershipOperationExecutionWork(row.id, query)
  if (!leaseToken) throw new IneligiblePurchaseReversalInProgressError(row.id)
  return { completed: false, leaseToken, id: row.id, idempotencyKey }
}
