import { randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { claimIneligiblePurchaseCancellationOperation } from '../../services/memberships/ineligible-stripe-purchase-cancellation.mts'
import { getTestCancellationClaimContext } from '../data-stores/psql/membership-ledger-immutability.mts'
import { createLocalTestUser } from '../data-stores/psql/users.mts'
import { createTestMembership } from './memberships.mts'
import type { TestAdministratorRefundOperation } from './membership-refund-reconciliation-schema.mts'
import { claimAdministratorRefundRequest } from '../../services/memberships/refund-reconciliation/administrator-request.mts'
import { leaseDueRefundReconciliation } from '../../services/memberships/refund-reconciliation/ledger.mts'
import type { AdministratorRefundRequest } from '../../services/memberships/refund-reconciliation/types.mts'
import { STRIPE_PROVIDER_ENVIRONMENT } from '../../config/stripe.mts'
import {
  createRefundRequestFingerprint,
  createStripeRefundIdempotencyKey,
  type MembershipRefundRequestIntent,
} from '../../services/memberships/refund-idempotency.mts'

export async function attemptYoungMembershipRetainedSnapshot(id: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* configureYoungMembershipSnapshotProbe */
    SELECT set_config('app.billing_retention_delete', 'on', true),
      set_config('app.payment_ledger_retention_months', '84', true)`)
  await query(sql`/* seedYoungMembershipReplayFence */
    INSERT INTO membership_operation_retained_identities
      (id, membership_provider_context_id, membership_lineage_binding_id,
        idempotency_key, operation_kind)
    SELECT id, membership_provider_context_id, membership_lineage_binding_id,
      idempotency_key, operation_kind FROM membership_operations WHERE id = ${id}`)
}

export async function claimTestCancellationReplay(
  context: Awaited<ReturnType<typeof getTestCancellationClaimContext>>,
  applicationId: string,
  subscriptionId: string,
) {
  await using query = await beginTransaction()
  const result = await claimIneligiblePurchaseCancellationOperation(
    context.membershipSourceId,
    context.membershipLineageBindingId,
    context.membershipProviderLineageId,
    'test',
    applicationId,
    subscriptionId,
    query,
  )
  await query.commit()
  return result
}

export async function createTestRetentionRefundAttempts(operationId: string, createdAt: Date) {
  const ids = [1, 2, 3].map(() => v7({ msecs: createdAt.getTime() }))
  await write(sql`/* createHistoricalRefundAttemptsForRetention */
    INSERT INTO membership_refund_operation_attempts (
      id, membership_operation_id, membership_provider_context_id, attempt_ordinal,
      provider_idempotency_key, amount_minor_units, currency_code
    ) SELECT fixture.id, operation.id, operation.membership_provider_context_id,
      fixture.ordinal, ${`retention-attempt-${randomUUID()}`} || fixture.ordinal::text, 100, 'usd'
    FROM membership_operations operation
    CROSS JOIN unnest(${ids}::uuid[], ARRAY[1, 2, 3]) AS fixture(id, ordinal)
    WHERE operation.id = ${operationId}`)
  return ids[0]!
}

export async function createTestRetainableAdministratorRefund(requestedAt: Date) {
  const user = await createLocalTestUser()
  const applicationId = 'voucha-web'
  const membership = await createTestMembership({
    user_id: user.id,
    stripe_subscription_id: `sub_${randomUUID()}`,
    provider_application_id: applicationId,
    provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
  })
  const intent: MembershipRefundRequestIntent = {
    targetUserId: user.id,
    chargeId: `ch_${randomUUID()}`,
    paymentIntentId: null,
    invoiceId: `in_${randomUUID()}`,
    reason: 'requested',
    cancel: false,
    amount: { amount: 100, currency: 'usd' },
    note: 'Private refund note',
    idempotencyToken: randomUUID(),
  }
  const request: AdministratorRefundRequest = {
    amount: { amount: 100, currency: 'usd' },
    cancelRequested: false,
    idempotencyKey: createStripeRefundIdempotencyKey(user.id, intent.idempotencyToken),
    issuedById: user.id,
    membershipId: membership.id,
    note: 'Private refund note',
    periodStartedAt: null,
    periodEndsAt: null,
    providerPaymentReference: intent.chargeId!,
    providerSubscriptionReference: null,
    reason: 'requested',
    requestFingerprint: createRefundRequestFingerprint(membership.id, intent),
  }
  const { rows } = await write<{
    id: string
  }>(sql`/* createHistoricalAdministratorRefundOperation */
    INSERT INTO membership_operations (
      id, membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      membership_provider_context_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code, requested_at
    ) SELECT ${v7({ msecs: requestedAt.getTime() })}, source.id, source.membership_provider_lineage_id, binding.id,
      lineage.membership_provider_context_id, 'administrator_refund', ${request.idempotencyKey},
      100, 100, 'usd', ${requestedAt}
    FROM membership_sources source
    JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    JOIN membership_lineage_bindings binding ON binding.membership_provider_lineage_id = lineage.id
    WHERE source.id = ${membership.membership_source_id}
      AND binding.user_id = ${user.id} AND binding.released_at IS NULL
    RETURNING id`)
  const operation: TestAdministratorRefundOperation = {
    id: rows[0]!.id,
    applicationId,
    membershipSourceId: membership.membership_source_id,
    userId: user.id,
  }
  await claimAdministratorRefundRequest(request)
  const { rows: refunds } = await write<{
    id: string
  }>(sql`/* createHistoricalAdministratorRefundReceipt */
    INSERT INTO membership_refunds (
      id, membership_operation_id, membership_id, membership_source_id, user_id,
      stripe_refund_id, stripe_charge_id, stripe_idempotency_key, admin_request_fingerprint,
      amount_minor_units, currency_code, reason, issued_by_id, source, note
    ) VALUES (
      ${v7({ msecs: requestedAt.getTime() })}, ${operation.id}, ${membership.id}, ${operation.membershipSourceId}, ${user.id},
      ${`re_${randomUUID()}`}, ${request.providerPaymentReference}, ${request.idempotencyKey},
      ${request.requestFingerprint}, 100, 'usd', 'requested', ${user.id}, 'admin', ${request.note}
    ) RETURNING id`)
  return { operation, request, refundId: refunds[0]!.id, intent, issuerId: user.id }
}

export async function completeTestRefundWithMetadataScan(
  operationId: string,
  attemptId: string,
  completedAt: Date,
): Promise<void> {
  await using query = await beginTransaction()
  const lease = await leaseDueRefundReconciliation(operationId, query)
  if (!lease) throw new Error('Expected a live refund execution lease')
  await query(sql`/* createRetainedRefundMetadataScan */
    INSERT INTO membership_refund_operation_attempt_metadata_scans (
      membership_refund_operation_attempt_id, lease_token, created_at, updated_at
    ) VALUES (${attemptId}, ${lease.leaseToken}, ${completedAt}, ${completedAt})`)
  await query(sql`/* completeHistoricalRefundAfterMetadataScan */
    UPDATE membership_operations SET completed_at = ${completedAt}
    WHERE id = ${operationId} AND completed_at IS NULL`)
  await query.commit()
}
