import { read, write } from '@data-stores/psql'
import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'

export type TestAdministratorRefundOperation = {
  applicationId: string
  id: string
  membershipSourceId: string
}

export async function createTestAdministratorRefundOperation(): Promise<TestAdministratorRefundOperation> {
  const applicationId = `administrator-refund-${randomUUID()}`
  const { rows } = await write<{
    id: string
    membershipSourceId: string
  }>(sql`/* createTestAdministratorRefundOperation */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${randomUUID()}`})
      RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT id, (SELECT id FROM users ORDER BY id LIMIT 1) FROM lineage
      RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
      SELECT 'direct', id FROM lineage
      RETURNING id, membership_provider_lineage_id
    )
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      provider, environment, application_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, reconciliation_due_at
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      'stripe', 'test', ${applicationId}, 'administrator_refund', ${`operation-${randomUUID()}`},
      100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM source INNER JOIN binding
      ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id, membership_source_id AS "membershipSourceId"`)
  return { applicationId, ...rows[0]! }
}

export async function claimTestAdministratorRefundOperation(operationId: string): Promise<number> {
  const result = await write(sql`/* claimTestAdministratorRefundOperation */
    UPDATE membership_operations
    SET execution_claim_token = ${randomUUID()}, execution_claimed_at = CURRENT_TIMESTAMP,
      reconciliation_attempt_ordinal = reconciliation_attempt_ordinal + 1
    WHERE id = ${operationId}`)
  return result.rowCount ?? 0
}

export async function scheduleTestAdministratorRefundRetry(operationId: string): Promise<number> {
  const result = await write(sql`/* scheduleTestAdministratorRefundRetry */
    UPDATE membership_operations
    SET failed_at = CURRENT_TIMESTAMP, failure_message = 'provider outcome pending',
      reconciliation_due_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
      execution_claim_token = NULL, execution_claimed_at = NULL
    WHERE id = ${operationId}`)
  return result.rowCount ?? 0
}

export async function getTestAdministratorRefundRetryState(operationId: string) {
  const { rows } = await read<{
    reconciliationAttemptOrdinal: number
    reconciliationDueAt: Date
  }>(sql`/* getTestAdministratorRefundRetryState */
    SELECT reconciliation_attempt_ordinal AS "reconciliationAttemptOrdinal",
      reconciliation_due_at AS "reconciliationDueAt"
    FROM membership_operations WHERE id = ${operationId}`)
  return rows[0]
}

export async function hasExpectedTestMembershipOperationReconciliationDueIndex(): Promise<boolean> {
  const { rows } = await read<{ indexdef: string }>(
    `/* getTestMembershipOperationReconciliationDueIndex */
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'membership_operations'
        AND indexname = 'idx_membership_operations__reconciliation_due'`,
  )
  return (
    rows[0]?.indexdef ===
    'CREATE INDEX idx_membership_operations__reconciliation_due ON public.membership_operations USING btree (reconciliation_due_at, id) WHERE ((completed_at IS NULL) AND (reconciliation_due_at IS NOT NULL))'
  )
}

export async function createTestAdministratorRefundRequest(operationId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestAdministratorRefundRequest */
    INSERT INTO membership_administrator_refund_operation_requests (
      membership_operation_id, membership_id, issued_by_id, provider_payment_reference,
      amount_minor_units, currency_code, reason, cancel_requested, request_fingerprint,
      administrator_request_key, note
    ) VALUES (
      ${operationId}, ${randomUUID()}, ${randomUUID()}, ${`payment-${randomUUID()}`},
      100, 'usd', 'requested', true, ${'a'.repeat(64)}, ${`request-${randomUUID()}`},
      'Customer requested a refund'
    ) RETURNING id`)
  return rows[0]!.id
}

export async function mutateTestAdministratorRefundRequest(requestId: string): Promise<void> {
  await write(sql`/* mutateTestAdministratorRefundRequest */
    UPDATE membership_administrator_refund_operation_requests SET note = 'changed' WHERE id = ${requestId}`)
}

export async function createTestRefundOperationAttempt(
  operation: TestAdministratorRefundOperation,
  providerRefundId?: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestRefundOperationAttempt */
    INSERT INTO membership_refund_operation_attempts (
      membership_operation_id, provider, environment, application_id,
      attempt_ordinal, provider_idempotency_key, provider_refund_id,
      amount_minor_units, currency_code
    ) VALUES (
      ${operation.id}, 'stripe', 'test', ${operation.applicationId},
      1, ${`attempt-${randomUUID()}`}, ${providerRefundId ?? null}, 100, 'usd'
    ) RETURNING id`)
  return rows[0]!.id
}

export async function enrichTestRefundOperationAttemptProviderId(
  attemptId: string,
): Promise<number> {
  const result = await write(sql`/* enrichTestRefundOperationAttemptProviderId */
    UPDATE membership_refund_operation_attempts
    SET provider_refund_id = ${`refund-${randomUUID()}`} WHERE id = ${attemptId}`)
  return result.rowCount ?? 0
}

export async function mutateTestRefundOperationAttemptAmount(attemptId: string): Promise<void> {
  await write(sql`/* mutateTestRefundOperationAttemptAmount */
    UPDATE membership_refund_operation_attempts SET amount_minor_units = 99 WHERE id = ${attemptId}`)
}

export async function deleteTestRefundOperationAttempt(attemptId: string): Promise<void> {
  await write(sql`/* deleteTestRefundOperationAttempt */
    DELETE FROM membership_refund_operation_attempts WHERE id = ${attemptId}`)
}

export async function getTestMembershipRefundOperationLinkNullable(): Promise<boolean | undefined> {
  const { rows } = await read<{ isNullable: string }>(
    `/* getTestMembershipRefundOperationLinkNullable */
      SELECT is_nullable AS "isNullable" FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'membership_refunds'
        AND column_name = 'membership_operation_id'`,
  )
  return rows[0]?.isNullable === 'YES'
}

export async function createTestLinkedRefundReceiptRequest(
  operationId: string,
): Promise<{ requestKey: string }> {
  const requestKey = `request-${randomUUID()}`
  await write(sql`/* createTestLinkedRefundReceiptRequest */
    INSERT INTO membership_administrator_refund_operation_requests (
      membership_operation_id, administrator_request_key, membership_id, issued_by_id,
      provider_payment_reference, amount_minor_units, currency_code, reason, cancel_requested,
      request_fingerprint
    ) VALUES (
      ${operationId}, ${requestKey}, ${randomUUID()}, ${randomUUID()}, ${`ch_${randomUUID()}`},
      100, 'usd', 'requested', false, ${'b'.repeat(64)}
    )`)
  return { requestKey }
}

export async function insertTestLegacyUnlinkedRefundReceipt(
  membershipSourceId: string,
): Promise<number> {
  const result = await write(sql`/* insertTestLegacyUnlinkedRefundReceipt */
    INSERT INTO membership_refunds (
      membership_id, membership_source_id, stripe_refund_id, stripe_charge_id,
      amount_minor_units, currency_code, reason, revoked_access, source
    ) VALUES (
      ${randomUUID()}, ${membershipSourceId}, ${`re_legacy_${randomUUID()}`},
      ${`ch_legacy_${randomUUID()}`}, 100, 'usd', 'other', FALSE, 'stripe_dashboard'
    )`)
  return result.rowCount ?? 0
}

export async function insertTestLinkedOperationRefundReceipt(
  operation: TestAdministratorRefundOperation,
  requestKey: string,
): Promise<number> {
  const result = await write(sql`/* insertTestLinkedOperationRefundReceipt */
    INSERT INTO membership_refunds (
      membership_operation_id, membership_id, membership_source_id, stripe_refund_id,
      stripe_charge_id, stripe_idempotency_key, admin_request_fingerprint,
      amount_minor_units, currency_code, reason, revoked_access, issued_by_id, source
    ) VALUES (
      ${operation.id}, ${randomUUID()}, ${operation.membershipSourceId}, ${`re_linked_${randomUUID()}`},
      ${`ch_linked_${randomUUID()}`}, ${requestKey}, ${'b'.repeat(64)},
      100, 'usd', 'requested', FALSE, ${randomUUID()}, 'admin'
    )`)
  return result.rowCount ?? 0
}
