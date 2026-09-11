import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipRefund, MembershipRefundReason } from './types.mts'
import type { Money } from '@ts-shared/money'
import { assertMembershipRefundIntent } from './refund-intents.mts'
import { MembershipRefundRequestConflictError } from './refund-errors.mts'
import {
  mapMembershipRefund,
  mapMembershipRefundLedger,
  type MembershipRefundLedger,
  type MembershipRefundLedgerRow,
} from './refund-row-mapping.mts'

export { MembershipRefundRequestConflictError }
export { getMembershipRefunds } from './refund-row-mapping.mts'
export { recordMembershipRefundWebhook } from './refunds/index.mts'

export async function recordAdminMembershipRefund(
  options: {
    membershipId: string
    userId: string
    stripeRefundId: string
    stripeChargeId: string
    stripePaymentIntentId: string | null
    stripeIdempotencyKey: string
    adminRequestFingerprint: string
    amount: Money
    reason: MembershipRefundReason
    revokedAccess: boolean
    issuedById: string
    stripeEventId: string | null
    note: string | null
  },
  query?: QueryExecutor,
): Promise<MembershipRefund> {
  if (!query) {
    await using transaction = await beginTransaction()
    const result = await recordAdminMembershipRefund(options, transaction)
    await transaction.commit()
    return result
  }

  await assertMembershipRefundIntent(
    {
      membershipId: options.membershipId,
      issuedById: options.issuedById,
      stripeIdempotencyKey: options.stripeIdempotencyKey,
      requestFingerprint: options.adminRequestFingerprint,
    },
    query,
  )

  const { rows: insertedRows } = await query(sql`/* recordMembershipRefund:insert */
    INSERT INTO membership_refunds (
      membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
      stripe_payment_intent_id,
      stripe_idempotency_key, admin_request_fingerprint, amount_minor_units, currency_code, reason,
      revoked_access, issued_by_id, source, stripe_event_id, note
    ) SELECT
      ${options.membershipId}, intent.membership_source_id, ${options.userId},
      ${options.stripeRefundId}, ${options.stripeChargeId},
      ${options.stripePaymentIntentId ?? null}, ${options.stripeIdempotencyKey ?? null},
      ${options.adminRequestFingerprint ?? null}, ${options.amount.amount}, ${options.amount.currency},
      ${options.reason}, ${options.revokedAccess}, ${options.issuedById}, 'admin',
      ${options.stripeEventId ?? null}, ${options.note ?? null}
    FROM membership_refund_intents intent
    WHERE intent.stripe_idempotency_key = ${options.stripeIdempotencyKey}
    ON CONFLICT DO NOTHING
    RETURNING *
  `)
  const inserted = insertedRows[0] as MembershipRefundLedgerRow | undefined
  if (inserted) return mapMembershipRefund(inserted)

  {
    const { rows: claimedRows } =
      await query(sql`/* recordAdminMembershipRefund:claimWebhookReceipt */
      UPDATE membership_refunds
      SET source = 'admin',
          issued_by_id = ${options.issuedById},
          reason = ${options.reason},
          revoked_access = revoked_access OR ${options.revokedAccess},
          stripe_payment_intent_id = COALESCE(
            stripe_payment_intent_id, ${options.stripePaymentIntentId ?? null}
          ),
          stripe_idempotency_key = ${options.stripeIdempotencyKey},
          admin_request_fingerprint = ${options.adminRequestFingerprint},
          note = ${options.note ?? null}
      WHERE stripe_refund_id = ${options.stripeRefundId}
        AND source = 'stripe_dashboard'
        AND membership_id = ${options.membershipId}
        AND membership_source_id = (
          SELECT membership_source_id
          FROM membership_refund_intents
          WHERE stripe_idempotency_key = ${options.stripeIdempotencyKey}
        )
        AND user_id = ${options.userId}
        AND stripe_charge_id = ${options.stripeChargeId}
        AND (
          stripe_payment_intent_id IS NULL
          OR ${options.stripePaymentIntentId ?? null}::TEXT IS NULL
          OR stripe_payment_intent_id = ${options.stripePaymentIntentId ?? null}
        )
        AND amount_minor_units = ${options.amount.amount}
        AND currency_code = ${options.amount.currency}
        AND stripe_idempotency_key IS NULL
        AND admin_request_fingerprint IS NULL
      RETURNING *
    `)
    const claimed = claimedRows[0] as MembershipRefundLedgerRow | undefined
    if (claimed) return mapMembershipRefund(claimed)
  }

  const { rows: existingRows } = await query(sql`/* recordMembershipRefund:lockReceipt */
    SELECT * FROM membership_refunds
    WHERE stripe_refund_id = ${options.stripeRefundId}
    FOR UPDATE
  `)
  const existingRow = existingRows[0] as MembershipRefundLedgerRow | undefined
  const existing = existingRow ? mapMembershipRefund(existingRow) : undefined
  if (!existing || !refundReceiptMatches(existing, options)) {
    throw new MembershipRefundRequestConflictError()
  }
  return existing
}

function refundReceiptMatches(
  refund: MembershipRefund,
  options: Parameters<typeof recordAdminMembershipRefund>[0],
): boolean {
  return (
    refund.membership_id === options.membershipId &&
    refund.user_id === options.userId &&
    refund.stripe_charge_id === options.stripeChargeId &&
    paymentIntentIdsAreCompatible(refund.stripe_payment_intent_id, options.stripePaymentIntentId) &&
    refund.amount.amount === options.amount.amount &&
    refund.amount.currency === options.amount.currency &&
    refund.stripe_idempotency_key === options.stripeIdempotencyKey &&
    refund.admin_request_fingerprint === options.adminRequestFingerprint
  )
}

function paymentIntentIdsAreCompatible(left: string | null, right: string | null): boolean {
  return left === null || right === null || left === right
}

export async function getMembershipRefundByStripeIdempotencyKey(
  stripeIdempotencyKey: string,
  query?: QueryExecutor,
): Promise<MembershipRefundLedger | null> {
  const run = query ?? write
  const { rows } = await run(sql`/* getMembershipRefundByStripeIdempotencyKey */
    SELECT * FROM membership_refunds
    WHERE stripe_idempotency_key = ${stripeIdempotencyKey}
  `)
  const row = rows[0] as MembershipRefundLedgerRow | undefined
  return row ? mapMembershipRefundLedger(row) : null
}

export async function transitionMembershipRefundRevokedAccess(
  stripeIdempotencyKey: string,
  adminRequestFingerprint: string,
  query: QueryExecutor,
): Promise<MembershipRefund | null> {
  const { rows } = await query(sql`/* transitionMembershipRefundRevokedAccess */
    UPDATE membership_refunds
    SET revoked_access = true
    WHERE stripe_idempotency_key = ${stripeIdempotencyKey}
      AND admin_request_fingerprint = ${adminRequestFingerprint}
      AND revoked_access = false
    RETURNING *
  `)
  const row = rows[0] as MembershipRefundLedgerRow | undefined
  return row ? mapMembershipRefund(row) : null
}
