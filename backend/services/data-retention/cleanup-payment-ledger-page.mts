import { beginTransaction } from '@data-stores/psql'
export type Family = 'stripe_event' | 'membership_operation'
export type CleanupPage = { family: Family; scanned: number; deleted: number; hasMore: boolean }
const TABLES: Record<Family, string> = {
  stripe_event: 'stripe_events',
  membership_operation: 'membership_operations',
}
export async function cleanupPaymentLedgerPage(
  family: Family,
  pageSize: number,
  recordIds?: readonly string[],
): Promise<CleanupPage> {
  await using query = await beginTransaction()
  if (!recordIds)
    await query(
      `/* ensurePaymentLedgerRetentionCursor */
     INSERT INTO payment_ledger_retention_cursors (family) VALUES ($1)
     ON CONFLICT DO NOTHING`,
      [family],
    )
  const progress = recordIds
    ? []
    : (
        await query<{ cursor_record_id: string | null }>(
          `/* lockPaymentLedgerRetentionCursor */
     SELECT cursor_record_id FROM payment_ledger_retention_cursors WHERE family = $1 FOR UPDATE`,
          [family],
        )
      ).rows
  const { rows: candidates } = recordIds
    ? await query<{ id: string }>(
        `/* listScopedPaymentLedgerRetentionCandidates */
       SELECT id FROM ${TABLES[family]} WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [recordIds],
      )
    : await query<{ id: string }>(
        `/* listPaymentLedgerRetentionCandidates */
       SELECT id FROM ${TABLES[family]}
       WHERE ($1::uuid IS NULL OR id > $1::uuid)
       ORDER BY id LIMIT $2`,
        [progress[0]?.cursor_record_id ?? null, pageSize + 1],
      )
  const pageIds = candidates.slice(0, pageSize).map(row => row.id)
  let deleted = 0
  let retainedChildWork = false
  if (pageIds.length > 0) {
    await query(`/* enableBillingRetentionDelete */ SET LOCAL app.billing_retention_delete = 'on'`)
    if (family === 'stripe_event') {
      const { rows: expiring } = await query<{ stripe_event_id: string }>(
        `/* listExpiringStripeEventIdentities */
         SELECT event.stripe_event_id FROM stripe_events event
         WHERE event.id = ANY($1::uuid[])
           AND date_trunc('year', event.occurred_at AT TIME ZONE 'UTC') + INTERVAL '8 years'
             <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
           AND EXISTS (SELECT 1 FROM stripe_event_retained_identities identity
             WHERE identity.stripe_event_id = event.stripe_event_id)
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
           AND date_trunc('year', event.occurred_at AT TIME ZONE 'UTC') + INTERVAL '8 years'
             <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
           AND EXISTS (SELECT 1 FROM stripe_event_retained_identities identity
             WHERE identity.stripe_event_id = event.stripe_event_id)`,
        [pageIds],
      )
      deleted = result.rowCount ?? 0
    } else {
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
           AND operation.completed_at IS NOT NULL
           AND operation.operation_kind IN ('cancel_source', 'administrator_refund')
           AND NOT EXISTS (SELECT 1 FROM membership_ineligible_purchase_reversal_case_operations case_operation
             WHERE case_operation.membership_operation_id = operation.id)
           AND (operation.operation_kind = 'cancel_source' OR EXISTS (
             SELECT 1 FROM membership_administrator_refund_operation_requests request
             JOIN membership_refunds refund ON refund.membership_operation_id = operation.id
             WHERE request.membership_operation_id = operation.id
               AND (NOT request.is_cancel_requested OR refund.has_revoked_access)))
           AND date_trunc('year', GREATEST(operation.requested_at, operation.completed_at)
             AT TIME ZONE 'UTC') + INTERVAL '8 years' <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
         ORDER BY operation.idempotency_key, operation.membership_provider_context_id`,
        [pageIds],
      )
      // oxlint-disable no-await-in-loop -- producer-compatible operation locks are acquired in order.
      for (const operation of expiring) {
        const lockKey =
          operation.operation_kind === 'administrator_refund'
            ? operation.idempotency_key
            : `membership-operation:${operation.membership_provider_context_id}:${operation.idempotency_key}`
        const seed = operation.operation_kind === 'administrator_refund' ? 1950614898 : 0
        // no-mistakes-disable-next-line query-reached-per-item: selected terminal operations are capped and each idempotency identity needs its producer lock.
        await query(
          `/* lockMembershipOperationExpiry */
          SELECT pg_advisory_xact_lock(hashtextextended($1, $2))`,
          [lockKey, seed],
        )
      }
      // oxlint-enable no-await-in-loop
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
         WHERE operation.id = ANY($1::uuid[])
         ON CONFLICT ON CONSTRAINT membership_operation_retained_identities_pkey DO NOTHING`,
        [expiring.map(operation => operation.id)],
      )
      // Drain one capped provider-attempt page before its parent; each attempt has one metadata-scan child.
      await query(
        `/* deleteExpiredMembershipRefundAttempts */
         /* no-mistakes: deadlock-safe -- operation id plus attempt primary key is a total lock order within a bounded page. */
         WITH pending AS (
           SELECT attempt.id FROM membership_refund_operation_attempts attempt
           WHERE attempt.membership_operation_id = ANY($1::uuid[])
           ORDER BY attempt.membership_operation_id, attempt.id
           LIMIT $2 FOR UPDATE
         )
         DELETE FROM membership_refund_operation_attempts attempt
         USING pending WHERE attempt.id = pending.id`,
        [expiring.map(operation => operation.id), pageSize],
      )
      const result = await query(
        `/* deleteExpiredMembershipOperations */
         DELETE FROM membership_operations operation
         WHERE operation.id = ANY($1::uuid[])
           AND operation.completed_at IS NOT NULL
           AND operation.operation_kind IN ('cancel_source', 'administrator_refund')
           AND NOT EXISTS (
             SELECT 1 FROM membership_ineligible_purchase_reversal_case_operations case_operation
             WHERE case_operation.membership_operation_id = operation.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM membership_refund_operation_attempts attempt
             WHERE attempt.membership_operation_id = operation.id
           )
           AND date_trunc('year', GREATEST(operation.requested_at,
             operation.completed_at) AT TIME ZONE 'UTC')
             + INTERVAL '8 years' <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`,
        [expiring.map(operation => operation.id)],
      )
      deleted = result.rowCount ?? 0
      retainedChildWork = deleted < expiring.length
    }
  }
  const hasMore = retainedChildWork || (!recordIds && candidates.length > pageSize)
  if (!recordIds)
    await query(
      `/* checkpointPaymentLedgerRetentionCursor */
     UPDATE payment_ledger_retention_cursors SET cursor_record_id = $2 WHERE family = $1`,
      // Keep the previous position while a selected parent still has attempts. Advancing past
      // it would defer the next bounded child page until a full cursor cycle.
      [
        family,
        retainedChildWork
          ? (progress[0]?.cursor_record_id ?? null)
          : hasMore
            ? pageIds.at(-1)
            : null,
      ],
    )
  await query.commit()
  return { family, scanned: pageIds.length, deleted, hasMore }
}
