import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type StaffCaseFields = {
  reviewId: string
  amount: number
  stripePriceId: string
  currencyCode: string
  periodStartedAt: Date
  periodEndsAt: Date
}

type CaseWriteCounts = {
  reviewCount: number
  existingCount: number
  matchedCount: number
  insertedCount: number
}

/**
 * Inserts the reversal case before the caller deletes the review. The insert takes
 * FOR KEY SHARE on membership_sources, then membership_lineage_bindings, then currencies.
 * Staff text is only the price and currency predicate; stored columns are copied.
 */
export async function insertStaffStripePurchaseCollisionCase(
  staffCase: StaffCaseFields,
  query: QueryExecutor,
): Promise<CaseWriteCounts> {
  const { rows } = await query(sql`/* insertStaffStripePurchaseCollisionReversalCase */
    WITH review AS (
      SELECT review.id, review.membership_source_id, review.membership_provider_lineage_id,
        review.membership_lineage_binding_id, review.originating_invoice_id,
        review.winning_source_kind, review.collision_at
      FROM membership_stripe_purchase_collision_reviews review
      WHERE review.id = ${staffCase.reviewId}::uuid
    ), existing AS (
      SELECT 1 AS present
      FROM membership_ineligible_purchase_reversal_cases reversal_case
      INNER JOIN review
        ON reversal_case.membership_provider_lineage_id = review.membership_provider_lineage_id
        AND reversal_case.originating_invoice_id = review.originating_invoice_id
    ), matched AS (
      SELECT product.provider_product_id, product.currency_code
      FROM review
      INNER JOIN membership_provider_lineages lineage
        ON lineage.id = review.membership_provider_lineage_id
      INNER JOIN membership_provider_products product
        ON product.membership_provider_context_id = lineage.membership_provider_context_id
        AND product.provider_product_id = ${staffCase.stripePriceId}
        AND product.currency_code::text = ${staffCase.currencyCode}
      ORDER BY product.id
      LIMIT 1
    ), inserted AS (
      INSERT INTO membership_ineligible_purchase_reversal_cases (
        membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
        originating_invoice_id, stripe_price_id, winning_source_kind,
        qualifying_amount_minor_units, refund_cap_minor_units, currency_code,
        period_started_at, period_ends_at, collision_at
      )
      SELECT review.membership_source_id, review.membership_provider_lineage_id,
        review.membership_lineage_binding_id, review.originating_invoice_id,
        matched.provider_product_id, review.winning_source_kind,
        ${staffCase.amount}, ${staffCase.amount}, matched.currency_code,
        ${staffCase.periodStartedAt}, ${staffCase.periodEndsAt}, review.collision_at
      FROM review
      CROSS JOIN matched
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      ORDER BY review.membership_provider_lineage_id ASC NULLS LAST,
        review.originating_invoice_id ASC NULLS LAST
      ON CONFLICT (membership_provider_lineage_id, originating_invoice_id) DO NOTHING
      RETURNING id
    )
    SELECT (SELECT COUNT(*)::int FROM review) AS "reviewCount",
      (SELECT COUNT(*)::int FROM existing) AS "existingCount",
      (SELECT COUNT(*)::int FROM matched) AS "matchedCount",
      (SELECT COUNT(*)::int FROM inserted) AS "insertedCount"
  `)
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row) throw new Error('Staff reversal case write did not return a count')
  return {
    reviewCount: countOf(row, 'reviewCount'),
    existingCount: countOf(row, 'existingCount'),
    matchedCount: countOf(row, 'matchedCount'),
    insertedCount: countOf(row, 'insertedCount'),
  }
}

function countOf(row: Record<string, unknown>, key: string): number {
  const value = row[key] ?? row[key.toLowerCase()]
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed))
    throw new Error('Staff reversal case write did not return a count')
  return parsed
}
