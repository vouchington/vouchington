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

type TerritorialDelivery = { informed_at: Date | null; state: TerritorialDeliveryState | null }

/**
 * Delivery for each given (target, poster) pair: the first send since the decision and the latest
 * state of the restriction notices sent to that poster for that target. A poster on several
 * targets gets a separate answer per target, so a notice that failed for one target is not hidden
 * by one that was sent for another. A pair with no intent returns nulls, so every pair is present.
 */
export async function selectTerritorialPosterDelivery(
  noticeId: string,
  decidedAt: Date,
  pairs: readonly { targetId: string; userId: string }[],
  query: TransactionQuery,
): Promise<Map<string, Map<string, TerritorialDelivery>>> {
  const distinct = new Map(pairs.map(pair => [`${pair.targetId}:${pair.userId}`, pair]))
  if (distinct.size === 0) return new Map()
  const statement = sql`/* selectTerritorialPosterDelivery */
    SELECT pair.target_id, pair.user_id, aggregate.informed_at, aggregate.state
    FROM unnest(
      ${[...distinct.values()].map(pair => pair.targetId)}::uuid[],
      ${[...distinct.values()].map(pair => pair.userId)}::uuid[]
    ) pair(target_id, user_id)
    CROSS JOIN LATERAL (
      `
  statement.append(aggregateSql('poster', noticeId, decidedAt))
  statement.append(sql`
        AND intent.copyright_notice_target_id = pair.target_id
        AND intent.recipient_user_id = pair.user_id
    ) aggregate`)
  const { rows } = await query<TerritorialDelivery & { target_id: string; user_id: string }>(
    statement,
  )
  const byTarget = new Map<string, Map<string, TerritorialDelivery>>()
  for (const { target_id: targetId, user_id: userId, ...delivery } of rows) {
    const users = byTarget.get(targetId) ?? new Map<string, TerritorialDelivery>()
    users.set(userId, delivery)
    byTarget.set(targetId, users)
  }
  return byTarget
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
