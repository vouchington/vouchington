import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { StripeInvoiceWithAllPayments } from '@modules/stripe/invoices'
import type { MembershipPlanSlug } from '../types.mts'

/** Financial discovery uses the primary and retained source, including retired catalog entries. */
export async function getStripePurchaseCollisionPlans(
  source: { sourceId: string; lineageId: string },
  invoices: readonly StripeInvoiceWithAllPayments[],
): Promise<Map<string, MembershipPlanSlug>> {
  const priceIds = [
    ...new Set(
      invoices.flatMap(invoice =>
        invoice.lines.data.flatMap(line => {
          const price = line.pricing?.price_details?.price
          const id = typeof price === 'string' ? price : price?.id
          return id ? [id] : []
        }),
      ),
    ),
  ]
  if (priceIds.length === 0) return new Map()
  const { rows } = await write<{ priceId: string; plan: MembershipPlanSlug }>(
    buildGetStripePurchaseCollisionPlansQuery(source, priceIds),
  )
  const plans = new Map<string, MembershipPlanSlug>()
  for (const row of rows) {
    if (plans.has(row.priceId)) throw new Error(`Ambiguous Stripe membership price ${row.priceId}`)
    plans.set(row.priceId, row.plan)
  }
  return plans
}

export function buildGetStripePurchaseCollisionPlansQuery(
  source: { sourceId: string; lineageId: string },
  priceIds: readonly string[],
) {
  return sql`/* getStripePurchaseCollisionPlans */
    SELECT provider_product.provider_product_id AS "priceId", product.plan
    FROM membership_sources source
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    CROSS JOIN unnest(${priceIds}::text[]) requested(price_id)
    CROSS JOIN LATERAL (
      SELECT candidate.provider_product_id, candidate.membership_product_id
      FROM membership_provider_products candidate
      WHERE candidate.membership_provider_context_id = lineage.membership_provider_context_id
        AND candidate.provider_product_id = requested.price_id
      LIMIT 2
    ) provider_product
    INNER JOIN membership_products product ON product.id = provider_product.membership_product_id
    WHERE source.id = ${source.sourceId} AND source.source_kind = 'direct'
      AND lineage.id = ${source.lineageId}

  `
}
