import { beginTransaction } from '@data-stores/psql'
import { isUuid } from '@vouchington/utils/validation'
import sql from 'sql-template-strings'
import type { MembershipRefund } from '../types.mts'

export async function recordMembershipRefundEvent(options: {
  membershipId: string
  membershipSourceId: string
  userId: string
  stripeRefundId: string
  stripeChargeId: string
  stripePaymentIntentId: string | null | undefined
  amount: MembershipRefund['amount']
  stripeEventId: string
  stripeRefundMetadata?: Record<string, string> | null
  providerApplicationId?: string
  providerEnvironment?: 'test' | 'production'
}): Promise<{ operationIds: string[] }> {
  const operationId = options.stripeRefundMetadata?.membership_refund_operation_id
  const attemptId = options.stripeRefundMetadata?.membership_refund_attempt_id
  const canMatchReconciliationAttempt =
    !!operationId && !!attemptId && isUuid(operationId) && isUuid(attemptId)
  await using transaction = await beginTransaction()
  if (!canMatchReconciliationAttempt) {
    await transaction(sql`/* recordMembershipRefundEvent:unlinkedReceipt */
      INSERT INTO membership_refunds (
        membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
        stripe_payment_intent_id, amount_minor_units, currency_code, reason, revoked_access,
        issued_by_id, source, stripe_event_id
      ) SELECT
        ${options.membershipId}, source.id, ${options.userId}, ${options.stripeRefundId},
        ${options.stripeChargeId}, ${options.stripePaymentIntentId ?? null},
        ${options.amount.amount}, ${options.amount.currency}, 'other', FALSE, NULL,
        'stripe_dashboard', ${options.stripeEventId}
      FROM membership_sources source
      WHERE source.id = ${options.membershipSourceId}
        AND (
          source.user_id = ${options.userId}
          OR EXISTS (
            SELECT 1 FROM membership_changes membership_change
            WHERE membership_change.membership_source_id = source.id
              AND membership_change.membership_id = ${options.membershipId}
              AND membership_change.user_id = ${options.userId}
          )
        )
      ON CONFLICT (stripe_refund_id) DO NOTHING
    `)
    await transaction.commit()
    return { operationIds: [] }
  }
  const { rows } = await transaction(sql`/* recordMembershipRefundEvent */
    WITH receipt AS (
      INSERT INTO membership_refunds (
      membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
      stripe_payment_intent_id,
      amount_minor_units, currency_code, reason, revoked_access, issued_by_id, source, stripe_event_id
    ) SELECT
      ${options.membershipId}, source.id, ${options.userId},
      ${options.stripeRefundId} AS stripe_refund_id, ${options.stripeChargeId},
      ${options.stripePaymentIntentId ?? null}, ${options.amount.amount}, ${options.amount.currency},
      'other', false, NULL, 'stripe_dashboard', ${options.stripeEventId}
    FROM membership_sources source
    WHERE source.id = ${options.membershipSourceId}
      AND (
        source.user_id = ${options.userId}
        OR EXISTS (
          SELECT 1
          FROM membership_changes membership_change
          WHERE membership_change.membership_source_id = source.id
            AND membership_change.membership_id = ${options.membershipId}
            AND membership_change.user_id = ${options.userId}
        )
      )
    ORDER BY stripe_refund_id ASC NULLS LAST
    ON CONFLICT (stripe_refund_id) DO NOTHING
      RETURNING stripe_refund_id, stripe_charge_id, stripe_payment_intent_id,
        amount_minor_units, currency_code
    ), persisted_receipt AS (
      SELECT stripe_refund_id, stripe_charge_id, stripe_payment_intent_id,
        amount_minor_units, currency_code
      FROM receipt
      UNION ALL
      SELECT stripe_refund_id, stripe_charge_id, stripe_payment_intent_id,
        amount_minor_units, currency_code
      FROM membership_refunds
      WHERE stripe_refund_id = ${options.stripeRefundId}
        AND NOT EXISTS (SELECT 1 FROM receipt)
    ), matched_attempt AS (
      UPDATE membership_refund_operation_attempts attempt
      SET provider_refund_id = receipt.stripe_refund_id
      FROM persisted_receipt receipt, membership_operations operation,
        membership_administrator_refund_operation_requests request
      WHERE attempt.id = ${attemptId}
        AND attempt.membership_operation_id = ${operationId}
        AND operation.id = attempt.membership_operation_id
        AND request.membership_operation_id = operation.id
        AND (
          attempt.provider_refund_id IS NULL
          OR attempt.provider_refund_id = receipt.stripe_refund_id
        )
        AND attempt.provider = 'stripe'
        AND attempt.environment = ${options.providerEnvironment ?? 'production'}
        AND attempt.application_id = ${options.providerApplicationId ?? 'voucha-web'}
        AND operation.provider = 'stripe'
        AND operation.environment = ${options.providerEnvironment ?? 'production'}
        AND operation.application_id = ${options.providerApplicationId ?? 'voucha-web'}
        AND operation.operation_kind = 'administrator_refund'
        AND attempt.amount_minor_units = receipt.amount_minor_units
        AND attempt.currency_code = receipt.currency_code
        AND request.amount_minor_units = receipt.amount_minor_units
        AND request.currency_code = receipt.currency_code
        AND request.provider_payment_reference IN (
          receipt.stripe_charge_id, receipt.stripe_payment_intent_id
        )
      RETURNING attempt.membership_operation_id
    ), woken_operation AS (
      UPDATE membership_operations operation
      SET reconciliation_due_at = CURRENT_TIMESTAMP
      FROM matched_attempt
      WHERE operation.id = matched_attempt.membership_operation_id
        AND operation.completed_at IS NULL
      RETURNING operation.id
    )
    SELECT id FROM woken_operation
  `)
  await transaction.commit()
  return { operationIds: rows.map(row => (row as { id: string }).id) }
}
