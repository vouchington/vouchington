import sql from 'sql-template-strings'
import { copyrightDecisionDeliveryKinds } from './delivery-types.mts'

export type TerritorialDeliveryState = 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced'

/**
 * A lateral join (alias `delivery`) of the decision delivery that reached one recipient: the first
 * send since the decision and the latest state. Correlated to the page row aliased `target` (poster)
 * or `receipt` (claimant) and, for a poster, to `party.user_id`. It always yields one row, with nulls when nothing was delivered.
 */
export function territorialDeliverySql(
  role: 'claimant' | 'poster',
  decidedAt: Date,
): ReturnType<typeof sql> {
  const statement = sql`LEFT JOIN LATERAL (
      SELECT MIN(intent.sent_at) FILTER (WHERE intent.state = 'sent' AND intent.sent_at >= ${decidedAt}::timestamptz) AS informed_at,
        (array_agg(intent.state ORDER BY intent.id DESC))[1] AS state
      FROM copyright_notice_delivery_work_items intent
      WHERE intent.recipient_role::text = ${role}`
  statement.append(
    role === 'poster'
      ? sql` AND intent.copyright_notice_id = target.copyright_notice_id`
      : sql` AND intent.copyright_notice_id = receipt.copyright_notice_id`,
  )
  if (role === 'poster') statement.append(sql` AND intent.recipient_user_id = party.user_id`)
  statement.append(sql`
        AND intent.delivery_kind = ${copyrightDecisionDeliveryKinds[role === 'poster' ? 0 : 1]}::copyright_notice_delivery_kinds
        -- no-mistakes-disable-next-line postgres-generated-column-predicates: No SQL UUIDv7 timestamp-to-bound helper exists; the territorial decision time is the delivery cutoff.
        AND (intent.created_at >= ${decidedAt}::timestamptz OR intent.sent_at >= ${decidedAt}::timestamptz)
    ) delivery ON true`)
  return statement
}
