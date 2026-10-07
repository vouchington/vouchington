import { read } from '@data-stores/psql'
import { parsePostgresMoneyAmount } from '@ts-shared/money'
import sql from 'sql-template-strings'
import type { MembershipRefund, MembershipRefundRow } from '../types.mts'

/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/memberships/README.md`.
 */
export async function getMembershipRefunds(userId: string): Promise<MembershipRefund[]> {
  const { rows } = await read(sql`/* getMembershipRefunds */
    SELECT id, membership_id, user_id, stripe_refund_id, stripe_charge_id,
      stripe_payment_intent_id, stripe_idempotency_key, admin_request_fingerprint,
      amount_minor_units, currency_code, reason, has_revoked_access, issued_by_id,
      source, stripe_event_id, note, created_at
    FROM membership_refunds
    WHERE user_id = ${userId}
    ORDER BY id DESC
  `)
  return (rows as MembershipRefundRow[]).map(mapMembershipRefund)
}

function mapMembershipRefund(row: MembershipRefundRow): MembershipRefund {
  const { amount_minor_units, currency_code, ...refund } = row
  return {
    ...refund,
    amount: {
      amount: parsePostgresMoneyAmount(amount_minor_units),
      currency: currency_code,
    },
  }
}
