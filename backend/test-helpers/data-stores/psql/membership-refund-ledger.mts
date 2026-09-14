import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type QueryResult = { rowCount: number | null }

export async function createRefundIntentSources(): Promise<[string, string]> {
  const { rows } = await write<{ id: string }>(sql`/* createRefundIntentSources */
    INSERT INTO membership_sources (user_id, source_kind)
    VALUES (${randomUUID()}, 'admin_grant'), (${randomUUID()}, 'admin_grant')
    RETURNING id`)
  return [rows[0]!.id, rows[1]!.id]
}

export async function createImmutableRefundIntent(
  membershipId: string,
  sourceId: string,
  idempotencyKey: string,
  fingerprint: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createImmutableRefundIntent */
    INSERT INTO membership_refund_intents (
      membership_id, membership_source_id, issued_by_id,
      stripe_idempotency_key, request_fingerprint
    ) VALUES (
      ${membershipId}, ${sourceId}, ${randomUUID()}, ${idempotencyKey}, ${fingerprint}
    ) RETURNING id`)
  return rows[0]!.id
}

export function mutateRefundIntentSource(intentId: string, sourceId: string): Promise<QueryResult> {
  return write(sql`/* rejectRefundIntentSourceMutation */ UPDATE membership_refund_intents
    SET membership_source_id = ${sourceId} WHERE id = ${intentId}`)
}

export function deleteRefundIntent(intentId: string): Promise<QueryResult> {
  return write(sql`/* rejectRefundIntentDelete */ DELETE FROM membership_refund_intents
    WHERE id = ${intentId}`)
}

export function insertMismatchedRefundReceipt(
  membershipId: string,
  sourceId: string,
  idempotencyKey: string,
  fingerprint: string,
): Promise<QueryResult> {
  return write(sql`/* rejectRefundReceiptMismatchedSource */ INSERT INTO membership_refunds (
    membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
    stripe_idempotency_key, admin_request_fingerprint, amount_minor_units, currency_code,
    reason, issued_by_id, source
  ) VALUES (
    ${membershipId}, ${sourceId}, ${randomUUID()}, ${`re_${randomUUID()}`},
    ${`ch_${randomUUID()}`}, ${idempotencyKey}, ${fingerprint}, 100, 'usd',
    'requested', ${randomUUID()}, 'admin'
  )`)
}

export async function createRefundReceiptFixture(userId: string): Promise<string> {
  const { rows: sourceRows } = await write<{ id: string }>(sql`/* createRefundReceiptSource */
    INSERT INTO membership_sources (user_id, source_kind)
    VALUES (${userId}, 'admin_grant') RETURNING id`)
  const sourceId = sourceRows[0]!.id
  const idempotencyKey = `schema-refund-${randomUUID()}`
  const fingerprint = 'b'.repeat(64)
  await write(sql`/* createRefundReceiptIntent */ INSERT INTO membership_refund_intents (
    membership_id, membership_source_id, issued_by_id,
    stripe_idempotency_key, request_fingerprint
  ) VALUES (${randomUUID()}, ${sourceId}, ${randomUUID()}, ${idempotencyKey}, ${fingerprint})`)
  const { rows } = await write<{ id: string }>(sql`/* createGuardedRefundReceipt */
    INSERT INTO membership_refunds (
      membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
      stripe_idempotency_key, admin_request_fingerprint, amount_minor_units, currency_code,
      reason, issued_by_id, source
    ) VALUES (
      ${randomUUID()}, ${sourceId}, ${userId}, ${`re_${randomUUID()}`}, ${`ch_${randomUUID()}`},
      ${idempotencyKey}, ${fingerprint}, 100, 'usd', 'requested', ${randomUUID()}, 'admin'
    ) RETURNING id`)
  return rows[0]!.id
}

export function revokeRefundReceiptAccess(refundId: string): Promise<QueryResult> {
  return write(sql`/* revokeRefundReceiptAccess */ UPDATE membership_refunds
    SET revoked_access = true WHERE id = ${refundId}`)
}

export function rollbackRefundReceiptAccess(refundId: string): Promise<QueryResult> {
  return write(sql`/* rejectRefundReceiptRevocationRollback */ UPDATE membership_refunds
    SET revoked_access = false WHERE id = ${refundId}`)
}

export function mutateRefundReceiptSource(refundId: string): Promise<QueryResult> {
  return write(sql`/* rejectRefundReceiptSourceMutation */ UPDATE membership_refunds
    SET membership_source_id = ${randomUUID()} WHERE id = ${refundId}`)
}

export function deleteRefundReceipt(refundId: string): Promise<QueryResult> {
  return write(sql`/* rejectRefundReceiptDelete */ DELETE FROM membership_refunds
    WHERE id = ${refundId}`)
}
