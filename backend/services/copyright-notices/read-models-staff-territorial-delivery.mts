import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightDecisionDeliveryKinds } from './delivery-types.mts'

export type TerritorialDeliveryState = 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced'

function aggregateSql(
  role: 'claimant' | 'poster',
  noticeId: string,
  decidedAt: Date,
): ReturnType<typeof sql> {
  return sql`SELECT MIN(intent.sent_at) FILTER (WHERE intent.state = 'sent' AND intent.sent_at >= ${decidedAt}::timestamptz) AS informed_at,
        (array_agg(intent.state ORDER BY intent.id DESC))[1] AS state
      FROM copyright_notice_delivery_work_items intent
      WHERE intent.copyright_notice_id = ${noticeId}
        AND intent.recipient_role::text = ${role}
        AND intent.delivery_kind = ${copyrightDecisionDeliveryKinds[role === 'poster' ? 0 : 1]}::copyright_notice_delivery_kinds
        -- no-mistakes-disable-next-line postgres-generated-column-predicates: No SQL UUIDv7 timestamp-to-bound helper exists; the territorial decision time is the delivery cutoff.
        AND (intent.created_at >= ${decidedAt}::timestamptz OR intent.sent_at >= ${decidedAt}::timestamptz)`
}

/**
 * Delivery for the given posters, read once per distinct poster: the first send since the decision
 * and the latest state of the intents that reached that poster. A poster on many targets of one
 * page is read once, not once per target. Posters without an intent are absent from the result.
 */
export async function selectTerritorialPosterDelivery(
  noticeId: string,
  decidedAt: Date,
  userIds: readonly string[],
  query: TransactionQuery,
): Promise<Map<string, { informed_at: Date | null; state: TerritorialDeliveryState | null }>> {
  if (userIds.length === 0) return new Map()
  const statement = sql`/* selectTerritorialPosterDelivery */
    SELECT person.user_id, aggregate.informed_at, aggregate.state
    FROM unnest(${[...new Set(userIds)]}::uuid[]) person(user_id)
    CROSS JOIN LATERAL (
      `
  statement.append(aggregateSql('poster', noticeId, decidedAt))
  statement.append(sql`
        AND intent.recipient_user_id = person.user_id
    ) aggregate`)
  const { rows } = await query<{
    user_id: string
    informed_at: Date | null
    state: TerritorialDeliveryState | null
  }>(statement)
  return new Map(rows.map(({ user_id: userId, ...delivery }) => [userId, delivery]))
}

/**
 * The CTE `delivery`, one row: the first send since the decision and the latest state of the
 * notice's claimant decision notices, which are not tied to a single receipt. Read once per page.
 */
export function territorialClaimantDeliveryCte(
  noticeId: string,
  decidedAt: Date,
): ReturnType<typeof sql> {
  const statement = sql`delivery AS (
      `
  statement.append(aggregateSql('claimant', noticeId, decidedAt))
  statement.append(sql`
    )`)
  return statement
}
