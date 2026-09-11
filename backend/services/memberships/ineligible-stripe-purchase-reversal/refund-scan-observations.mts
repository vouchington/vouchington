import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { StripeRefund } from './refund-history.mts'

export type InspectedStripeRefundPage = {
  hasMore: boolean
  headStripeRefundId: string | null
  nextCursor: string | null
  nonterminalRefundSeen: boolean
  succeeded: Array<{ amount: number; currency: string; id: string }>
}

export function inspectStripeRefundPage(
  page: { hasMore: boolean; nextCursor: string | undefined; refunds: readonly StripeRefund[] },
  currency: string,
): InspectedStripeRefundPage {
  const succeeded: InspectedStripeRefundPage['succeeded'] = []
  const succeededIds = new Set<string>()
  let nonterminalRefundSeen = false
  for (const refund of page.refunds) {
    assertNonemptyId(refund.id, 'Stripe refund ID')
    if (refund.status === 'failed' || refund.status === 'canceled') continue
    if (!Number.isSafeInteger(refund.amount) || refund.amount < 0)
      throw new Error('Stripe refund amount must be a non-negative safe integer')
    if (refund.currency !== currency)
      throw new Error(`Stripe refund currency ${refund.currency} did not match ${currency}`)
    if (refund.status === 'succeeded') {
      if (succeededIds.has(refund.id))
        throw new Error('Stripe refund page repeated a succeeded refund ID')
      succeededIds.add(refund.id)
      succeeded.push(refund)
    } else nonterminalRefundSeen = true
  }
  if (page.hasMore) {
    if (!page.nextCursor) throw new Error('Stripe refund page is missing its next cursor')
    assertNonemptyId(page.nextCursor, 'Stripe refund cursor')
  }
  return {
    hasMore: page.hasMore,
    headStripeRefundId: page.refunds[0]?.id ?? null,
    nextCursor: page.hasMore ? page.nextCursor! : null,
    nonterminalRefundSeen,
    succeeded,
  }
}

export async function insertSucceededStripeRefundObservations(
  scanId: string,
  observations: readonly { amount: number; currency: string; id: string }[],
  query: QueryExecutor,
): Promise<void> {
  if (observations.length === 0) return
  const ids = observations.map(({ id }) => id)
  const amounts = observations.map(({ amount }) => amount)
  const currencies = observations.map(({ currency }) => currency)
  await query(sql`/* insertSucceededStripeRefundObservations:insert */
    INSERT INTO membership_ineligible_purchase_reversal_refund_observations (
      membership_ineligible_purchase_reversal_refund_scan_id, stripe_refund_id,
      amount_minor_units, currency_code
    ) SELECT ${scanId}, refund_id, amount_minor_units, currency_code
    FROM UNNEST(${ids}::TEXT[], ${amounts}::BIGINT[], ${currencies}::TEXT[])
      AS observation(refund_id, amount_minor_units, currency_code)
    ON CONFLICT DO NOTHING
  `)
  const { rows } = await query<{ amount: string; currency: string; id: string }>(
    sql`/* insertSucceededStripeRefundObservations:verify */
      SELECT stripe_refund_id AS id, amount_minor_units::TEXT AS amount, currency_code AS currency
      FROM membership_ineligible_purchase_reversal_refund_observations
      WHERE membership_ineligible_purchase_reversal_refund_scan_id = ${scanId}
        AND stripe_refund_id = ANY(${ids}::TEXT[])
    `,
  )
  const actual = new Map(rows.map(row => [row.id, `${row.amount}:${row.currency}`]))
  for (const observation of observations) {
    if (actual.get(observation.id) !== `${observation.amount}:${observation.currency}`)
      throw new Error('Stripe refund observation conflicts with its immutable persisted value')
  }
}

function assertNonemptyId(value: string, name: string): void {
  if (!value || value !== value.trim()) throw new Error(`${name} must be nonempty and trimmed`)
}
