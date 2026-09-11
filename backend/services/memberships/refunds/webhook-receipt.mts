import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipRefund } from '../types.mts'

export async function recordMembershipRefundWebhook(options: {
  membershipId: string
  membershipSourceId: string
  userId: string
  stripeRefundId: string
  stripeChargeId: string
  stripePaymentIntentId: string | null | undefined
  amount: MembershipRefund['amount']
  stripeEventId: string
}): Promise<void> {
  await write(sql`/* recordMembershipRefundWebhook */
    INSERT INTO membership_refunds (
      membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id,
      stripe_payment_intent_id,
      amount_minor_units, currency_code, reason, revoked_access, issued_by_id, source, stripe_event_id
    ) SELECT
      ${options.membershipId}, source.id, ${options.userId},
      ${options.stripeRefundId} AS stripe_refund_id, ${options.stripeChargeId},
      ${options.stripePaymentIntentId ?? null}, ${options.amount.amount}, ${options.amount.currency},
      'other', false, NULL, 'stripe_dashboard', ${options.stripeEventId}
    FROM membership_sources source
    WHERE source.id = ${options.membershipSourceId}
      AND (
        source.user_id = ${options.userId}
        OR EXISTS (
          SELECT 1
          FROM membership_changes membership_change
          WHERE membership_change.membership_source_id = source.id
            AND membership_change.membership_id = ${options.membershipId}
            AND membership_change.user_id = ${options.userId}
        )
      )
    ORDER BY stripe_refund_id ASC NULLS LAST
    ON CONFLICT (stripe_refund_id) DO NOTHING
  `)
}
