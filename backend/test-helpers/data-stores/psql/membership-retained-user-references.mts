import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'
import { createTestAdministratorRefundOperation } from '../../entities/membership-refund-reconciliation-schema.mts'
import { createLocalTestUser } from './users.mts'

export const membershipRetainedUserReferences = [
  ['membership_changes', 'user_id'],
  ['membership_changes', 'changed_by_id'],
  ['membership_grants', 'granted_by_id'],
  ['membership_grants', 'revoked_by_id'],
  ['membership_refunds', 'user_id'],
  ['membership_refunds', 'issued_by_id'],
  ['membership_administrator_refund_operation_requests', 'issued_by_id'],
  ['membership_sources', 'user_id'],
] as const

export type MembershipRetainedUserReference = readonly [table: string, column: string]

export type MembershipRetainedUserForeignKey = {
  column: string
  deleteAction: string
  indexed: boolean
  table: string
  target: string
}

export async function readMembershipRetainedUserForeignKeys(): Promise<
  MembershipRetainedUserForeignKey[]
> {
  const { rows } = await read<MembershipRetainedUserForeignKey>(
    `/* readMembershipRetainedUserForeignKeys */
    SELECT c.conrelid::regclass::text AS "table", a.attname AS "column",
      c.confrelid::regclass::text AS target, c.confdeltype::text AS "deleteAction",
      EXISTS (
        SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indisvalid
          AND i.indkey[0] = c.conkey[1]
      ) AS indexed
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'retained_user_identities'::regclass
      AND c.conrelid = ANY (ARRAY[
        'membership_changes', 'membership_grants', 'membership_refunds',
        'membership_sources', 'membership_administrator_refund_operation_requests'
      ]::regclass[])`,
  )
  return rows
}

async function createAdminGrantSource(): Promise<{ sourceId: string; userId: string }> {
  const user = await createLocalTestUser()
  const { rows } = await write<{ id: string }>(sql`/* createRetainedReferenceGrantSource */
    INSERT INTO membership_sources (user_id, source_kind) VALUES (${user.id}, 'admin_grant')
    RETURNING id`)
  return { sourceId: rows[0]!.id, userId: user.id }
}

async function insertGrant(grantedById: string | null, revokedById: string | null): Promise<void> {
  const { sourceId, userId } = await createAdminGrantSource()
  await write(sql`/* insertRetainedReferenceGrant */
    INSERT INTO membership_grants (
      membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot,
      granted_by_id, revoked_at, revoked_by_id, revocation_reason
    ) VALUES (
      ${sourceId}, ${userId}, (SELECT id FROM membership_products LIMIT 1), 30, 'schema test',
      ${grantedById}::uuid, CASE WHEN ${revokedById}::uuid IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
      ${revokedById}::uuid, CASE WHEN ${revokedById}::uuid IS NULL THEN NULL ELSE 'policy reversal' END
    )`)
}

async function insertRefund(userId: string | null, issuedById: string | null): Promise<void> {
  const { sourceId } = await createAdminGrantSource()
  const admin = issuedById !== null
  await write(sql`/* insertRetainedReferenceRefund */
    INSERT INTO membership_refunds (
      membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
      stripe_idempotency_key, admin_request_fingerprint, amount_minor_units, currency_code,
      reason, issued_by_id, source
    ) VALUES (
      uuidv7(), ${sourceId}, ${userId}::uuid, ${`re_${randomUUID()}`}, ${`ch_${randomUUID()}`},
      ${admin ? `request-${randomUUID()}` : null}, ${admin ? 'c'.repeat(64) : null}, 100, 'usd',
      'other', ${issuedById}::uuid, ${admin ? 'admin' : 'stripe_dashboard'}::membership_refund_sources
    )`)
}

// Inserts one otherwise-valid row that stores `userId` in exactly the referenced column, so the
// only constraint that can reject it is the retained-user-identity foreign key under test.
export async function insertMembershipRowReferencingUser(
  [table, column]: MembershipRetainedUserReference,
  userId: string,
): Promise<void> {
  switch (`${table}.${column}`) {
    case 'membership_changes.user_id':
    case 'membership_changes.changed_by_id': {
      const actor = column === 'user_id' ? userId : (await createLocalTestUser()).id
      const changedBy = column === 'user_id' ? null : userId
      await write(sql`/* insertRetainedReferenceChange */
        INSERT INTO membership_changes (membership_id, user_id, change_type, changed_by_id)
        VALUES (uuidv7(), ${actor}, 'admin_grant', ${changedBy}::uuid)`)
      return
    }
    case 'membership_grants.granted_by_id':
      return insertGrant(userId, null)
    case 'membership_grants.revoked_by_id':
      return insertGrant(null, userId)
    case 'membership_refunds.user_id':
      return insertRefund(userId, null)
    case 'membership_refunds.issued_by_id':
      return insertRefund(null, userId)
    case 'membership_sources.user_id':
      await write(sql`/* insertRetainedReferenceSource */
        INSERT INTO membership_sources (user_id, source_kind) VALUES (${userId}, 'admin_grant')`)
      return
    default: {
      const operation = await createTestAdministratorRefundOperation()
      await write(sql`/* insertRetainedReferenceAdministratorRequest */
        INSERT INTO membership_administrator_refund_operation_requests (
          membership_operation_id, administrator_request_key, membership_id, issued_by_id,
          provider_payment_reference, amount_minor_units, currency_code, reason,
          cancel_requested, request_fingerprint
        ) VALUES (
          ${operation.id}, ${`request-${randomUUID()}`}, uuidv7(), ${userId},
          ${`ch_${randomUUID()}`}, 100, 'usd', 'requested', false, ${'d'.repeat(64)}
        )`)
    }
  }
}
