import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { mapLease, type ReconciliationLeaseRow } from './ledger-mappers.mts'
import type { RefundReconciliationDispatch, RefundReconciliationLease } from './types.mts'

/** Reads the active primary-backed lease immediately before a provider side effect. */
export async function getClaimedRefundReconciliationLease(
  dispatch: RefundReconciliationDispatch,
): Promise<RefundReconciliationLease | null> {
  const { rows } = await write(sql`/* getClaimedRefundReconciliationLease */
    SELECT id, execution_claim_token AS "leaseToken", reconciliation_attempt_ordinal AS "attemptOrdinal",
      provider, environment AS "providerEnvironment", application_id AS "providerApplicationId",
      provider_refund_id AS "providerRefundId", remaining_refundable_minor_units::TEXT AS "amountMinorUnits",
      currency_code AS currency
    FROM membership_operations
    WHERE id = ${dispatch.id} AND completed_at IS NULL
      AND execution_claim_token = ${dispatch.leaseToken}
  `)
  const row = rows[0] as ReconciliationLeaseRow | undefined
  return row ? mapLease(row) : null
}
