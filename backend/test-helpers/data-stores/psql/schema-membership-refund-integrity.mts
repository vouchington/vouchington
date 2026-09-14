import { read } from '@data-stores/psql'

type ConstraintDefinition = { constraint_type: string; definition: string }

export type MembershipRefundOperationConstraintState = {
  hasExpectedConstraints: boolean
  hasAdministratorRequestReference: boolean
  hasOperationSourceReference: boolean
  hasRestrictiveDeletion: boolean
}

export async function getMembershipRefundOperationConstraintState(): Promise<MembershipRefundOperationConstraintState> {
  const { rows } = await read<ConstraintDefinition>(
    `/* getMembershipRefundOperationConstraints */
      SELECT contype::text AS constraint_type, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'membership_refunds'::regclass
        AND conname IN (
          'fk_membership_refunds__operation_source',
          'fk_membership_refunds__administrator_request'
        )
      ORDER BY conname`,
  )
  return {
    hasExpectedConstraints: rows.length === 2,
    hasAdministratorRequestReference: rows.some(
      row =>
        row.constraint_type === 'f' &&
        row.definition.includes('(membership_operation_id, stripe_idempotency_key)'),
    ),
    hasOperationSourceReference: rows.some(
      row =>
        row.constraint_type === 'f' &&
        row.definition.includes('(membership_operation_id, membership_source_id)'),
    ),
    hasRestrictiveDeletion: rows.every(row => row.definition.includes('ON DELETE RESTRICT')),
  }
}

export type AdministratorRefundIdentityState = {
  hasExpectedConstraint: boolean
  requiresAdministratorSource: boolean
  requiresIssuer: boolean
  requiresIdempotencyKey: boolean
  requiresRequestFingerprint: boolean
  excludesRetiredIdempotencyFlag: boolean
}

export async function getAdministratorRefundIdentityState(): Promise<AdministratorRefundIdentityState> {
  const { rows } = await read<{ definition: string }>(
    `/* getMembershipRefundSourceConstraint */
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'membership_refunds'::regclass
        AND conname = 'membership_refunds_source_identity_check'`,
  )
  const definition = rows[0]?.definition
  return {
    hasExpectedConstraint: rows.length === 1,
    requiresAdministratorSource: definition?.includes("source = 'admin'") === true,
    requiresIssuer: definition?.includes('issued_by_id IS NOT NULL') === true,
    requiresIdempotencyKey: definition?.includes('stripe_idempotency_key IS NOT NULL') === true,
    requiresRequestFingerprint:
      definition?.includes('admin_request_fingerprint IS NOT NULL') === true,
    excludesRetiredIdempotencyFlag: definition?.includes('idempotent_admin') === false,
  }
}
