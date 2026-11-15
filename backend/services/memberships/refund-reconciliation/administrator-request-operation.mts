import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { MAX_LOCAL_STRIPE_REFUND_ISSUANCES_PER_CHARGE } from '../refund-issuance.mts'
import type { AdministratorRefundOperation } from './administrator-request-matching.mts'

export async function getLockedAdministratorRefundOperation(
  idempotencyKey: string,
  membershipId: string,
  query: QueryExecutor,
): Promise<(AdministratorRefundOperation & { refundLimitReached: boolean }) | null> {
  const { rows } = await query(sql`/* getLockedAdministratorRefundOperation */
    SELECT operation.id, operation.completed_at IS NOT NULL AS completed,
      (SELECT COUNT(*) FROM (
        SELECT attempt.id
        FROM membership_operations refund_operation
        INNER JOIN membership_refund_operation_attempts attempt
          ON attempt.membership_operation_id = refund_operation.id
        WHERE refund_operation.membership_provider_context_id = operation.membership_provider_context_id
          AND refund_operation.provider_charge_id = operation.provider_charge_id
          AND attempt.rejected_at IS NULL
        LIMIT ${MAX_LOCAL_STRIPE_REFUND_ISSUANCES_PER_CHARGE}
      ) outstanding) >= ${MAX_LOCAL_STRIPE_REFUND_ISSUANCES_PER_CHARGE}
        AND NOT EXISTS (
          SELECT 1 FROM membership_administrator_refund_operation_requests existing_request
          WHERE existing_request.membership_operation_id = operation.id
        ) AS "refundLimitReached"
    FROM memberships membership
    INNER JOIN membership_operations operation
      ON operation.membership_source_id = membership.membership_source_id
    INNER JOIN membership_sources source ON source.id = operation.membership_source_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = operation.membership_provider_lineage_id
    WHERE membership.id = ${membershipId}
      AND operation.operation_kind = 'administrator_refund'
      AND operation.idempotency_key = ${idempotencyKey}
      AND source.membership_provider_lineage_id = lineage.id
      AND operation.membership_provider_lineage_id = lineage.id
  `)
  return (
    (rows[0] as (AdministratorRefundOperation & { refundLimitReached: boolean }) | undefined) ??
    null
  )
}
