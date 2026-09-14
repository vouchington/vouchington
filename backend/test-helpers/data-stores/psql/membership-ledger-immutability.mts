import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createLocalTestUser } from './users.mts'

type QueryResult = { rowCount: number | null }
type MembershipOperationTransition =
  | 'changeBinding'
  | 'changeIdempotencyKey'
  | 'complete'
  | 'delete'
  | 'failWithoutMessage'
  | 'failWithMessage'
  | 'resetCompletion'
type MembershipRefundOperationTransition =
  | 'claimWithoutTimestamp'
  | 'fail'
  | 'providerRefund'
  | 'remainingRefundable'

export async function createTestImmutableMembershipGrant(): Promise<string> {
  const { rows: products } = await read<{ id: string }>(
    sql`/* getImmutableTestGrantProduct */ SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`,
  )
  const { rows } = await write<{ id: string }>(sql`/* createImmutableTestGrant */
    WITH source AS (INSERT INTO membership_sources (user_id, source_kind) VALUES (${randomUUID()}, 'admin_grant') RETURNING id, user_id)
    INSERT INTO membership_grants (membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot)
    SELECT id, user_id, ${products[0]!.id}, 30, 'Test issuer' FROM source RETURNING id`)
  return rows[0]!.id
}
export function attemptTestMembershipGrantMutation(
  grantId: string,
  transition: 'changeCalendarDays' | 'delete' | 'revoke' | 'rewriteReason' | 'rewriteRevoker',
): Promise<QueryResult> {
  switch (transition) {
    case 'changeCalendarDays':
      return write(
        sql`/* rejectTestMembershipGrantMutation */ UPDATE membership_grants SET calendar_days = 31 WHERE id = ${grantId}`,
      )
    case 'delete':
      return write(
        sql`/* deleteTestMembershipGrant */ DELETE FROM membership_grants WHERE id = ${grantId}`,
      )
    case 'revoke':
      return write(
        sql`/* revokeTestMembershipGrant */ UPDATE membership_grants SET revoked_at = CURRENT_TIMESTAMP, revoked_by_id = ${randomUUID()}, revocation_reason = 'policy reversal' WHERE id = ${grantId}`,
      )
    case 'rewriteReason':
      return write(
        sql`/* rewriteTestMembershipGrantReason */ UPDATE membership_grants SET revocation_reason = 'changed' WHERE id = ${grantId}`,
      )
    case 'rewriteRevoker':
      return write(
        sql`/* rewriteTestMembershipGrantRevoker */ UPDATE membership_grants SET revoked_by_id = ${randomUUID()} WHERE id = ${grantId}`,
      )
  }
}
export async function createTestImmutableMembershipOperation(
  idempotencyKey: string,
  collisionAt: Date | null = null,
): Promise<string> {
  return createTestMembershipOperation(idempotencyKey, collisionAt, 'cancel_source')
}
export async function createTestRefundMembershipOperation(idempotencyKey: string): Promise<string> {
  return createTestMembershipOperation(idempotencyKey, null, 'automatic_refund')
}
async function createTestMembershipOperation(
  idempotencyKey: string,
  collisionAt: Date | null,
  operationKind: 'automatic_refund' | 'cancel_source',
): Promise<string> {
  const user = await createLocalTestUser()
  const applicationId = `${operationKind === 'automatic_refund' ? 'ledger-lease' : 'ledger-immutable'}-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* createTestMembershipOperation */
    WITH lineage AS (INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id)
      VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${randomUUID()}`}) RETURNING id),
    binding AS (INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id) SELECT id, ${user.id} FROM lineage RETURNING id, membership_provider_lineage_id),
    source AS (INSERT INTO membership_sources (source_kind, membership_provider_lineage_id) SELECT 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id)
    INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
      membership_lineage_binding_id, provider, environment, application_id, operation_kind,
      idempotency_key, collision_at, qualifying_allocation_minor_units,
      remaining_refundable_minor_units, currency_code, period_started_at, period_ends_at)
    SELECT source.id, source.membership_provider_lineage_id, binding.id, 'stripe', 'test',
      ${applicationId}, ${operationKind}, ${idempotencyKey}, ${collisionAt},
      CASE WHEN ${operationKind} = 'automatic_refund' THEN 100 END,
      CASE WHEN ${operationKind} = 'automatic_refund' THEN 100 END,
      CASE WHEN ${operationKind} = 'automatic_refund' THEN 'usd' END,
      CASE WHEN ${operationKind} = 'automatic_refund' THEN CURRENT_TIMESTAMP END,
      CASE WHEN ${operationKind} = 'automatic_refund' THEN CURRENT_TIMESTAMP END
    FROM source INNER JOIN binding ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id RETURNING id`)
  return rows[0]!.id
}

export function claimTestMembershipOperation(
  operationId: string,
  claimToken = randomUUID(),
): Promise<QueryResult> {
  return write(
    sql`/* claimImmutableTestOperation */ UPDATE membership_operations SET execution_claim_token = ${claimToken}, execution_claimed_at = CURRENT_TIMESTAMP WHERE id = ${operationId}`,
  )
}

export function attemptTestMembershipOperationTransition(
  operationId: string,
  transition: MembershipOperationTransition,
): Promise<QueryResult> {
  switch (transition) {
    case 'changeIdempotencyKey':
      return write(
        sql`/* rejectTestMembershipOperationIdempotencyMutation */ UPDATE membership_operations SET idempotency_key = 'changed' WHERE id = ${operationId}`,
      )
    case 'changeBinding':
      return write(
        sql`/* rejectTestMembershipOperationBindingMutation */ UPDATE membership_operations SET membership_lineage_binding_id = ${randomUUID()} WHERE id = ${operationId}`,
      )
    case 'delete':
      return write(
        sql`/* deleteTestMembershipOperation */ DELETE FROM membership_operations WHERE id = ${operationId}`,
      )
    case 'complete':
      return write(
        sql`/* completeTestMembershipOperation */ UPDATE membership_operations SET completed_at = CURRENT_TIMESTAMP, execution_claim_token = NULL, execution_claimed_at = NULL WHERE id = ${operationId}`,
      )
    case 'resetCompletion':
      return write(
        sql`/* resetTestMembershipOperationCompletion */ UPDATE membership_operations SET completed_at = NULL WHERE id = ${operationId}`,
      )
    case 'failWithoutMessage':
      return write(
        sql`/* failTestMembershipOperationWithoutMessage */ UPDATE membership_operations SET failed_at = CURRENT_TIMESTAMP, execution_claim_token = NULL, execution_claimed_at = NULL WHERE id = ${operationId}`,
      )
    case 'failWithMessage':
      return write(
        sql`/* failTestMembershipOperationWithMessage */ UPDATE membership_operations SET failed_at = CURRENT_TIMESTAMP, failure_message = 'provider request failed', execution_claim_token = NULL, execution_claimed_at = NULL WHERE id = ${operationId}`,
      )
  }
}

export function attemptTestRefundMembershipOperationTransition(
  operationId: string,
  transition: MembershipRefundOperationTransition,
  providerRefundId = `re_${randomUUID()}`,
): Promise<QueryResult> {
  switch (transition) {
    case 'claimWithoutTimestamp':
      return write(
        sql`/* rejectTestRefundOperationClaim */ UPDATE membership_operations SET execution_claim_token = ${randomUUID()} WHERE id = ${operationId}`,
      )
    case 'providerRefund':
      return write(
        sql`/* setTestProviderRefundId */ UPDATE membership_operations SET provider_refund_id = ${providerRefundId} WHERE id = ${operationId}`,
      )
    case 'fail':
      return write(
        sql`/* failTestRefundOperation */ UPDATE membership_operations SET failed_at = CURRENT_TIMESTAMP, failure_message = 'provider request failed', execution_claim_token = NULL, execution_claimed_at = NULL WHERE id = ${operationId}`,
      )
    case 'remainingRefundable':
      return write(
        sql`/* setTestRemainingRefundable */ UPDATE membership_operations SET remaining_refundable_minor_units = 50 WHERE id = ${operationId}`,
      )
  }
}

export async function createTestImmutableLineageBinding(): Promise<string> {
  const user = await createLocalTestUser()
  const applicationId = `binding-immutable-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* createImmutableTestBinding */
    WITH lineage AS (INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${randomUUID()}`}) RETURNING id)
    INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id) SELECT id, ${user.id} FROM lineage RETURNING id`)
  return rows[0]!.id
}

export function setTestLineageBindingOriginatingInvoice(
  bindingId: string,
  invoiceId: string,
): Promise<QueryResult> {
  return write(
    sql`/* setTestLineageBindingOriginatingInvoice */ UPDATE membership_lineage_bindings SET originating_invoice_id = ${invoiceId} WHERE id = ${bindingId}`,
  )
}

export async function createTestImmutableMembershipChange(): Promise<string> {
  const changeId = randomUUID()
  await write(
    sql`/* createImmutableTestMembershipChange */ INSERT INTO membership_changes (id, membership_id, user_id, change_type, note) VALUES (${changeId}, ${randomUUID()}, ${randomUUID()}, 'admin_grant', 'original')`,
  )
  return changeId
}

export function mutateTestMembershipChange(changeId: string): Promise<QueryResult> {
  return write(
    sql`/* mutateTestMembershipChange */ UPDATE membership_changes SET note = 'rewritten' WHERE id = ${changeId}`,
  )
}

export function deleteTestMembershipChange(changeId: string): Promise<QueryResult> {
  return write(
    sql`/* deleteTestMembershipChange */ DELETE FROM membership_changes WHERE id = ${changeId}`,
  )
}
