import {
  selectPaymentLedgerCandidates,
  type Family,
  type CleanupPage,
} from './cleanup-payment-ledger-candidates.mts'
export type { Family, CleanupPage } from './cleanup-payment-ledger-candidates.mts'
import { getLegalRecordRetentionWindows } from './config.mts'
import { drainExpiredMembershipOperationChildren } from './cleanup-payment-ledger-children.mts'
import { beginTransaction } from '@data-stores/psql'
export async function cleanupPaymentLedgerPage(
  family: Family,
  pageSize: number,
  recordIds?: readonly string[],
): Promise<CleanupPage> {
  await using query = await beginTransaction()
  await query(
    `/* configurePaymentLedgerRetentionWindow */
    SELECT set_config('app.payment_ledger_retention_months', $1, true)`,
    [String(getLegalRecordRetentionWindows().paymentLedgerMonths)],
  )
  const { candidates, cursorRecordId } = await selectPaymentLedgerCandidates(
    query,
    family,
    pageSize,
    recordIds,
  )
  const pageIds = candidates.slice(0, pageSize).map(row => row.id)
  let deleted = 0
  let hasMore = !recordIds && candidates.length > pageSize
  let checkpointId = pageIds.at(-1) ?? cursorRecordId
  let scanned = pageIds.length
  if (pageIds.length > 0) {
    await query(`/* enableBillingRetentionDelete */ SET LOCAL app.billing_retention_delete = 'on'`)
    if (family === 'stripe_event') {
      const { rows: expiring } = await query<{ stripe_event_id: string }>(
        `/* listExpiringStripeEventIdentities */
         SELECT event.stripe_event_id FROM stripe_events event
         WHERE event.id = ANY($1::uuid[])
           AND date_trunc('year', event.occurred_at AT TIME ZONE 'UTC') + make_interval(months => 12 + current_setting('app.payment_ledger_retention_months')::integer)
             <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
           AND EXISTS (SELECT 1 FROM stripe_event_retained_identities identity
             WHERE identity.stripe_event_id = event.stripe_event_id)
           AND NOT EXISTS (SELECT 1 FROM stripe_event_processing_work_items work
             WHERE work.stripe_event_id = event.id)
         ORDER BY event.stripe_event_id`,
        [pageIds],
      )
      // oxlint-disable no-await-in-loop -- stable lock order prevents cleanup and ingress races.
      for (const event of expiring) {
        // no-mistakes-disable-next-line query-reached-per-item: selected Stripe events are capped and each provider identity needs its own ingress-compatible advisory lock.
        await query(
          `/* lockStripeEventExpiry */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`stripe-event:${event.stripe_event_id}`],
        )
      }
      // oxlint-enable no-await-in-loop
      const result = await query(
        `/* deleteExpiredStripeEvents */
         DELETE FROM stripe_events event
         WHERE event.id = ANY($1::uuid[])
           AND date_trunc('year', event.occurred_at AT TIME ZONE 'UTC') + make_interval(months => 12 + current_setting('app.payment_ledger_retention_months')::integer)
             <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
           AND EXISTS (SELECT 1 FROM stripe_event_retained_identities identity
             WHERE identity.stripe_event_id = event.stripe_event_id)
           AND NOT EXISTS (SELECT 1 FROM stripe_event_processing_work_items work
             WHERE work.stripe_event_id = event.id)`,
        [pageIds],
      )
      deleted = result.rowCount ?? 0
    } else {
      // Handle the earliest eligible UUID in this capped scan. Keep its cursor prefix
      // until every child and the root fit the shared physical-row deletion budget.
      const { rows: expiring } = await query<{
        id: string
        idempotency_key: string
        membership_provider_context_id: string
        operation_kind: 'cancel_source' | 'administrator_refund'
      }>(
        `/* listExpiringMembershipOperationIdentities */
         SELECT operation.id, operation.idempotency_key, operation.membership_provider_context_id,
           operation.operation_kind
         FROM membership_operations operation
         WHERE operation.id = ANY($1::uuid[])
           AND fn_membership_operation_fiscal_retention_due(operation.id)
           AND (operation.operation_kind = 'cancel_source'
             OR fn_membership_operation_fiscal_retention_allowed(operation.id)
             OR EXISTS (
               SELECT 1 FROM membership_administrator_refund_operation_requests request
               JOIN membership_refunds refund ON refund.membership_operation_id = operation.id
               WHERE request.membership_operation_id = operation.id
                 AND (NOT request.is_cancel_requested OR refund.has_revoked_access)))
         ORDER BY operation.id LIMIT 1`,
        [pageIds],
      )
      const operation = expiring[0]
      if (operation) {
        const index = pageIds.indexOf(operation.id)
        scanned = index + 1
        checkpointId = operation.id
        hasMore = candidates.length > index + 1
        const lockKey =
          operation.operation_kind === 'administrator_refund'
            ? operation.idempotency_key
            : `membership-operation:${operation.membership_provider_context_id}:${operation.idempotency_key}`
        const seed = operation.operation_kind === 'administrator_refund' ? 1950614898 : 0
        await query(
          `/* lockMembershipOperationExpiry */ SELECT pg_advisory_xact_lock(hashtextextended($1, $2))`,
          [lockKey, seed],
        )
        await query(
          `/* lockMembershipOperationRetentionParent */
           SELECT id FROM membership_operations WHERE id = $1 FOR UPDATE`,
          [operation.id],
        )
        // Recheck after waiting on the producer and parent. INSERT fences share this
        // parent lock, so no late child can appear between proof and this page's drain.
        await query(
          `/* retainExpiredMembershipOperationIdentities */
           INSERT INTO membership_operation_retained_identities (
             id, membership_provider_context_id, membership_lineage_binding_id,
             idempotency_key, operation_kind,
             administrator_membership_id, administrator_issuer_sha256,
             administrator_request_fingerprint, administrator_response_snapshot)
           SELECT operation.id, operation.membership_provider_context_id,
             operation.membership_lineage_binding_id, operation.idempotency_key,
             operation.operation_kind, request.membership_id,
             sha256(convert_to(request.issued_by_id::text, 'UTF8')),
             request.request_fingerprint,
             CASE WHEN request.id IS NULL THEN NULL ELSE jsonb_build_object(
               'refundId', refund.id,
               'cancellationStatus', CASE WHEN request.is_cancel_requested
                 THEN 'completed' ELSE 'not_requested' END) END
           FROM membership_operations operation
           LEFT JOIN membership_administrator_refund_operation_requests request
             ON request.membership_operation_id = operation.id
           LEFT JOIN membership_refunds refund ON refund.membership_operation_id = operation.id
           WHERE operation.id = $1
             AND fn_membership_operation_fiscal_retention_due(operation.id)
             AND (operation.operation_kind = 'cancel_source' OR (refund.id IS NOT NULL
               AND (NOT request.is_cancel_requested OR refund.has_revoked_access)))
             AND NOT EXISTS (SELECT 1 FROM membership_operation_retained_identities identity
               WHERE identity.id = operation.id)
           ORDER BY operation.id ASC NULLS LAST
           ON CONFLICT ON CONSTRAINT membership_operation_retained_identities_pkey DO NOTHING`,
          [operation.id],
        )
        const { rows: eligible } = await query<{ allowed: boolean }>(
          `/* checkMembershipOperationRetentionProof */
           SELECT fn_membership_operation_fiscal_retention_allowed($1) AS allowed`,
          [operation.id],
        )
        if (eligible[0]?.allowed) {
          deleted = await drainExpiredMembershipOperationChildren(query, operation.id, pageSize)
          const result = await query(
            `/* deleteExpiredMembershipOperations */
             DELETE FROM membership_operations operation
             WHERE operation.id = $1 AND $2::integer > 0
               AND fn_membership_operation_fiscal_retention_allowed(operation.id)
               AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempts attempt
                 WHERE attempt.membership_operation_id = operation.id)
               AND NOT EXISTS (SELECT 1 FROM membership_refunds refund
                 WHERE refund.membership_operation_id = operation.id)
               AND NOT EXISTS (SELECT 1 FROM membership_administrator_refund_operation_requests request
                 WHERE request.membership_operation_id = operation.id)`,
            [operation.id, pageSize - deleted],
          )
          deleted += result.rowCount ?? 0
          if (!result.rowCount) {
            hasMore = true
            checkpointId = pageIds[index - 1] ?? cursorRecordId
          }
        }
      }
    }
  }
  if (!recordIds)
    await query(
      `/* checkpointPaymentLedgerRetentionCursor */
     UPDATE payment_ledger_retention_cursors SET cursor_record_id = $2 WHERE family = $1`,
      // Retry the unfinished parent after the fully handled prefix.
      [family, hasMore ? checkpointId : null],
    )
  await query.commit()
  return { family, scanned, deleted, hasMore }
}
