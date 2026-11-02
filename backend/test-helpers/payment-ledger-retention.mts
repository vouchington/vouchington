import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createLocalTestUser } from './data-stores/psql/users.mts'
import { claimTestMembershipOperation } from './data-stores/psql/membership-ledger-immutability.mts'
import { createTestMembership } from './entities/memberships.mts'
import { claimAdministratorRefundRequest } from '../services/memberships/refund-reconciliation/administrator-request.mts'
import { STRIPE_PROVIDER_ENVIRONMENT } from '../config/stripe.mts'
import {
  createRefundRequestFingerprint,
  createStripeRefundIdempotencyKey,
  type MembershipRefundRequestIntent,
} from '../services/memberships/refund-idempotency.mts'
import type { AdministratorRefundRequest } from '../services/memberships/refund-reconciliation/types.mts'

/** A fully joined cancellation whose requested and completed facts belong to a past fiscal year. */
export async function createCompletedFiscalCancellation(completedAt: Date): Promise<string> {
  const user = await createLocalTestUser()
  const applicationId = `fiscal-retention-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* createCompletedFiscalCancellation */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      VALUES (fn_upsert_membership_provider_context_id('stripe', 'test', ${applicationId}), ${`lineage-${randomUUID()}`})
      RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT id, ${user.id} FROM lineage RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
      SELECT 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id
    ) INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
      membership_lineage_binding_id, membership_provider_context_id, operation_kind,
      idempotency_key, requested_at)
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      fn_upsert_membership_provider_context_id('stripe', 'test', ${applicationId}),
      'cancel_source', ${randomUUID()}, ${new Date(completedAt.getTime() - 60_000)}
    FROM source JOIN binding ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id`)
  const id = rows[0]!.id
  await claimTestMembershipOperation(id)
  await write(sql`/* completeFiscalCancellation */ UPDATE membership_operations
    SET completed_at = ${completedAt} WHERE id = ${id}`)
  return id
}

/** Settled administrator refund with real request and receipt FK edges for cap-one drain tests. */
export async function createCompletedFiscalAdministratorRefund(completedAt: Date) {
  const user = await createLocalTestUser()
  const membership = await createTestMembership({
    user_id: user.id,
    stripe_subscription_id: `sub_${randomUUID()}`,
    provider_application_id: 'voucha-web',
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
  const { rows } = await write<{ id: string }>(sql`/* createFiscalAdministratorRefundOperation */
    INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
      membership_lineage_binding_id, membership_provider_context_id, operation_kind,
      idempotency_key, qualifying_allocation_minor_units, remaining_refundable_minor_units,
      currency_code, requested_at)
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      lineage.membership_provider_context_id, 'administrator_refund', ${request.idempotencyKey},
      100, 100, 'usd', ${new Date(completedAt.getTime() - 60_000)}
    FROM membership_sources source
    JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    JOIN membership_lineage_bindings binding ON binding.membership_provider_lineage_id = lineage.id
    WHERE source.id = ${membership.membership_source_id}
      AND binding.user_id = ${user.id} AND binding.released_at IS NULL RETURNING id`)
  const operationId = rows[0]!.id
  await claimAdministratorRefundRequest(request)
  await write(sql`/* createFiscalAdministratorRefundReceipt */
    INSERT INTO membership_refunds (membership_operation_id, membership_id, membership_source_id,
      user_id, stripe_refund_id, stripe_charge_id, stripe_idempotency_key,
      admin_request_fingerprint, amount_minor_units, currency_code, reason, issued_by_id, source, note)
    VALUES (${operationId}, ${membership.id}, ${membership.membership_source_id}, ${user.id},
      ${`re_${randomUUID()}`}, ${request.providerPaymentReference}, ${request.idempotencyKey},
      ${request.requestFingerprint}, 100, 'usd', 'requested', ${user.id}, 'admin', ${request.note})`)
  await claimTestMembershipOperation(operationId)
  await write(sql`/* completeFiscalAdministratorRefund */
    UPDATE membership_operations SET completed_at = ${completedAt} WHERE id = ${operationId}`)
  return operationId
}

export async function removeTerminalStripeWorkForRetention(eventId: string): Promise<void> {
  await write(sql`/* removeTerminalStripeWorkForRetention */
    DELETE FROM stripe_event_processing_work_items WHERE stripe_event_id = ${eventId}
      AND (processed_at IS NOT NULL OR ignored_at IS NOT NULL)`)
}

export async function paymentLedgerRecordExists(
  family: 'stripe_event' | 'membership_operation',
  id: string,
): Promise<boolean> {
  const { rows } =
    family === 'stripe_event'
      ? await read(
          sql`/* readRetainedStripeEventLedger */ SELECT id FROM stripe_events WHERE id = ${id}`,
        )
      : await read(
          sql`/* readRetainedMembershipOperationLedger */ SELECT id FROM membership_operations WHERE id = ${id}`,
        )
  return rows.length > 0
}
