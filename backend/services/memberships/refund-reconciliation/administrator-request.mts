import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import { parsePostgresMoneyAmount } from '@ts-shared/money'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { AdministratorRefundRequest } from './types.mts'

export async function claimAdministratorRefundRequest(
  request: AdministratorRefundRequest,
): Promise<{ id: string; completed: boolean }> {
  await using query = await beginTransaction()
  await query(sql`/* serializeAdministratorRefundRequestClaim */
    SELECT pg_advisory_xact_lock(hashtextextended(${request.idempotencyKey}, 1950614898))
  `)
  const existingRequest = await getAdministratorRefundRequestForMembershipKey(
    request.idempotencyKey,
    request.membershipId,
    query,
  )
  if (existingRequest) {
    assertAdministratorRefundRequestMatches(existingRequest, request)
    await query.commit()
    return { id: existingRequest.id, completed: existingRequest.completed }
  }
  await query(sql`/* claimAdministratorRefundRequest:operation */
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      provider, environment, application_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, reconciliation_due_at
    )
    SELECT source.id, lineage.id, binding.id,
      lineage.provider, lineage.environment, lineage.application_id,
      'administrator_refund', ${request.idempotencyKey},
      ${request.amount.amount}, ${request.amount.amount}, ${request.amount.currency},
      ${request.periodStartedAt}, ${request.periodEndsAt}, CURRENT_TIMESTAMP
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN membership_lineage_bindings binding
      ON binding.membership_provider_lineage_id = lineage.id AND binding.released_at IS NULL
    WHERE membership.id = ${request.membershipId}
    ON CONFLICT (provider, environment, application_id, idempotency_key) DO NOTHING
  `)
  const operation = await getLockedAdministratorRefundOperation(
    request.idempotencyKey,
    request.membershipId,
    query,
  )
  if (!operation)
    throw new Error('Administrator refund membership source has no active provider binding')

  await query(sql`/* claimAdministratorRefundRequest:request */
    INSERT INTO membership_administrator_refund_operation_requests (
      membership_operation_id, membership_id, issued_by_id, provider_payment_reference, provider_subscription_reference,
      amount_minor_units, currency_code, reason, cancel_requested, request_fingerprint,
      administrator_request_key, note
    ) VALUES (
      ${operation.id}, ${request.membershipId}, ${request.issuedById},
      ${request.providerPaymentReference}, ${request.providerSubscriptionReference}, ${request.amount.amount}, ${request.amount.currency},
      ${request.reason}, ${request.cancelRequested}, ${request.requestFingerprint},
      ${request.idempotencyKey}, ${request.note}
    ) ON CONFLICT (membership_operation_id) DO NOTHING
  `)
  const savedRequest = await getAdministratorRefundRequestForMembershipKey(
    request.idempotencyKey,
    request.membershipId,
    query,
  )
  if (!savedRequest) throw new Error('Administrator refund request was not persisted')
  assertAdministratorRefundRequestMatches(savedRequest, request)
  await query.commit()
  return operation
}

type AdministratorRefundOperation = { completed: boolean; id: string }
export type AdministratorRefundRequestRow = AdministratorRefundOperation & {
  amountMinorUnits: string
  cancelRequested: boolean
  currency: string
  issuedById: string
  membershipId: string
  note: string | null
  providerPaymentReference: string
  providerSubscriptionReference: string | null
  reason: string
  requestFingerprint: string
}

async function getLockedAdministratorRefundOperation(
  idempotencyKey: string,
  membershipId: string,
  query: QueryExecutor,
): Promise<AdministratorRefundOperation | null> {
  const { rows } = await query(sql`/* getLockedAdministratorRefundOperation */
    SELECT operation.id, operation.completed_at IS NOT NULL AS completed
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
      AND operation.provider = lineage.provider
      AND operation.environment = lineage.environment
      AND operation.application_id = lineage.application_id
    FOR UPDATE OF operation
  `)
  return (rows[0] as AdministratorRefundOperation | undefined) ?? null
}

export async function getAdministratorRefundRequestByKey(
  idempotencyKey: string,
  scope: {
    provider: string
    providerApplicationId: string
    providerEnvironment: string
  },
  query: QueryExecutor = write,
): Promise<AdministratorRefundRequestRow | null> {
  const { rows } = await query(sql`/* assertAdministratorRefundRequestMatches */
    SELECT operation.id, operation.completed_at IS NOT NULL AS completed,
      request.membership_id AS "membershipId", request.issued_by_id AS "issuedById",
      request.provider_payment_reference AS "providerPaymentReference",
      request.provider_subscription_reference AS "providerSubscriptionReference",
      request.amount_minor_units::TEXT AS "amountMinorUnits", request.currency_code AS currency,
      request.reason, request.cancel_requested AS "cancelRequested",
      request.request_fingerprint AS "requestFingerprint", request.note
    FROM membership_administrator_refund_operation_requests request
    INNER JOIN membership_operations operation
      ON operation.id = request.membership_operation_id
    WHERE request.administrator_request_key = ${idempotencyKey}
      AND operation.provider = ${scope.provider}
      AND operation.environment = ${scope.providerEnvironment}
      AND operation.application_id = ${scope.providerApplicationId}
  `)
  return (rows[0] as AdministratorRefundRequestRow | undefined) ?? null
}

async function getAdministratorRefundRequestForMembershipKey(
  idempotencyKey: string,
  membershipId: string,
  query: QueryExecutor,
): Promise<AdministratorRefundRequestRow | null> {
  const { rows } = await query(sql`/* getAdministratorRefundRequestForMembershipKey */
    SELECT operation.id, operation.completed_at IS NOT NULL AS completed,
      request.membership_id AS "membershipId", request.issued_by_id AS "issuedById",
      request.provider_payment_reference AS "providerPaymentReference",
      request.provider_subscription_reference AS "providerSubscriptionReference",
      request.amount_minor_units::TEXT AS "amountMinorUnits", request.currency_code AS currency,
      request.reason, request.cancel_requested AS "cancelRequested",
      request.request_fingerprint AS "requestFingerprint", request.note
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN membership_operations operation
      ON operation.provider = lineage.provider
      AND operation.environment = lineage.environment
      AND operation.application_id = lineage.application_id
    INNER JOIN membership_administrator_refund_operation_requests request
      ON request.membership_operation_id = operation.id
    WHERE membership.id = ${membershipId}
      AND request.administrator_request_key = ${idempotencyKey}
  `)
  return (rows[0] as AdministratorRefundRequestRow | undefined) ?? null
}

function assertAdministratorRefundRequestMatches(
  saved: AdministratorRefundRequestRow,
  request: AdministratorRefundRequest,
): void {
  if (!administratorRefundRequestMatches(saved, request))
    throw createHttpError(
      409,
      'Administrator refund idempotency key was reused for a different request',
    )
}

function administratorRefundRequestMatches(
  saved: AdministratorRefundRequestRow,
  request: AdministratorRefundRequest,
): boolean {
  return (
    saved.membershipId === request.membershipId &&
    saved.issuedById === request.issuedById &&
    saved.providerPaymentReference === request.providerPaymentReference &&
    saved.providerSubscriptionReference === request.providerSubscriptionReference &&
    parsePostgresMoneyAmount(saved.amountMinorUnits) === request.amount.amount &&
    saved.currency === request.amount.currency &&
    saved.reason === request.reason &&
    saved.cancelRequested === request.cancelRequested &&
    saved.requestFingerprint === request.requestFingerprint &&
    saved.note === request.note
  )
}
