import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, write } from '../index.mts'

describe('membership refund ledger schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('keeps intent sources immutable and requires receipts to reference the same source', async () => {
    const { rows: sourceRows } = await write<{ id: string }>(sql`/* createRefundIntentSources */
      INSERT INTO membership_sources (user_id, source_kind)
      VALUES (${randomUUID()}, 'admin_grant'), (${randomUUID()}, 'admin_grant')
      RETURNING id`)
    const intentSourceId = sourceRows[0]!.id
    const otherSourceId = sourceRows[1]!.id
    const membershipId = randomUUID()
    const idempotencyKey = `schema-refund-${randomUUID()}`
    const fingerprint = 'a'.repeat(64)
    const { rows: intentRows } = await write<{ id: string }>(sql`/* createImmutableRefundIntent */
      INSERT INTO membership_refund_intents (
        membership_id, membership_source_id, issued_by_id,
        stripe_idempotency_key, request_fingerprint
      ) VALUES (
        ${membershipId}, ${intentSourceId}, ${randomUUID()}, ${idempotencyKey}, ${fingerprint}
      ) RETURNING id`)

    await expect(
      write(sql`/* rejectRefundIntentSourceMutation */ UPDATE membership_refund_intents
        SET membership_source_id = ${otherSourceId} WHERE id = ${intentRows[0]!.id}`),
    ).rejects.toThrow('membership refund intents are append-only')
    await expect(
      write(sql`/* rejectRefundIntentDelete */ DELETE FROM membership_refund_intents
        WHERE id = ${intentRows[0]!.id}`),
    ).rejects.toThrow('membership refund intents are append-only')
    await expect(
      write(sql`/* rejectRefundReceiptMismatchedSource */ INSERT INTO membership_refunds (
        membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
        stripe_idempotency_key, admin_request_fingerprint, amount_minor_units, currency_code,
        reason, issued_by_id, source
      ) VALUES (
        ${membershipId}, ${otherSourceId}, ${randomUUID()}, ${`re_${randomUUID()}`},
        ${`ch_${randomUUID()}`}, ${idempotencyKey}, ${fingerprint}, 100, 'usd',
        'requested', ${randomUUID()}, 'admin'
      )`),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('only permits one-way receipt reconciliation and access revocation', async () => {
    const userId = randomUUID()
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
    const { rows: refundRows } = await write<{ id: string }>(sql`/* createGuardedRefundReceipt */
      INSERT INTO membership_refunds (
        membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
        stripe_idempotency_key, admin_request_fingerprint, amount_minor_units, currency_code,
        reason, issued_by_id, source
      ) VALUES (
        ${randomUUID()}, ${sourceId}, ${userId}, ${`re_${randomUUID()}`}, ${`ch_${randomUUID()}`},
        ${idempotencyKey}, ${fingerprint}, 100, 'usd', 'requested', ${randomUUID()}, 'admin'
      ) RETURNING id`)
    const refundId = refundRows[0]!.id

    await write(sql`/* revokeRefundReceiptAccess */ UPDATE membership_refunds
      SET revoked_access = true WHERE id = ${refundId}`)
    await expect(
      write(sql`/* rejectRefundReceiptRevocationRollback */ UPDATE membership_refunds
        SET revoked_access = false WHERE id = ${refundId}`),
    ).rejects.toThrow('only allow one-way')
    await expect(
      write(sql`/* rejectRefundReceiptSourceMutation */ UPDATE membership_refunds
        SET membership_source_id = ${randomUUID()} WHERE id = ${refundId}`),
    ).rejects.toThrow('receipt facts are immutable')
    await expect(
      write(sql`/* rejectRefundReceiptDelete */ DELETE FROM membership_refunds
        WHERE id = ${refundId}`),
    ).rejects.toThrow('cannot be deleted')
  })
})
