import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipPurchaseProvider } from './purchase-intent-launches.mts'
import type {
  MembershipVerificationReasonCode,
  MembershipVerificationStatus,
} from './verification-contract.mts'

export async function getMembershipPendingState(userId: string) {
  const [grantResult, verificationResult, operationResult] = await Promise.all([
    read<{ count: string }>(sql`/* getMembershipPendingState.grants */
      SELECT COUNT(*)::text AS count FROM membership_grants grant_row
      WHERE grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
        AND membership_grant_remaining_duration(grant_row.id) > INTERVAL '0'
        AND NOT EXISTS (
          SELECT 1 FROM membership_grant_activation_periods period
          WHERE period.membership_grant_id = grant_row.id AND period.ended_at IS NULL
        )`),
    read<{
      id: string
      provider: MembershipPurchaseProvider
      status: MembershipVerificationStatus
      reason_code: MembershipVerificationReasonCode | null
      next_processing_at: Date | null
    }>(sql`/* getMembershipPendingState.verifications */
      SELECT id, provider,
        CASE
          WHEN verified_at IS NOT NULL THEN 'verified'
          WHEN conflicted_at IS NOT NULL THEN 'conflict'
          WHEN rejected_at IS NOT NULL THEN 'rejected'
          ELSE 'pending'
        END AS status,
        result_code AS reason_code, next_processing_at
      FROM membership_verifications
      WHERE user_id = ${userId}
      ORDER BY id DESC
      LIMIT 50`),
    read<{
      id: string
      provider: MembershipPurchaseProvider
      kind:
        | 'cancel_source'
        | 'automatic_refund'
        | 'ineligible_purchase_reversal'
        | 'collision_resolution'
      status: 'pending' | 'failed'
    }>(sql`/* getMembershipPendingState.operations */
      SELECT operation.id, operation.provider, operation.operation_kind AS kind,
        CASE WHEN operation.failed_at IS NULL THEN 'pending' ELSE 'failed' END AS status
      FROM membership_operations operation
      INNER JOIN membership_sources source ON source.id = operation.membership_source_id
      WHERE source.user_id = ${userId} AND operation.completed_at IS NULL
      ORDER BY operation.id DESC
      LIMIT 50`),
  ])
  return {
    grants: Number(grantResult.rows[0]?.count ?? 0),
    verifications: verificationResult.rows,
    financial_operations: operationResult.rows,
  }
}
