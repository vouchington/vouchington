import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AmbiguousStripePurchaseCollisionInvoice } from './case-producer.mts'
import type { StripePurchaseCollisionWork } from './collision-work.mts'

/** Preserve uncertain invoices for staff without guessing a financial outcome. */
export async function recordStripePurchaseCollisionReviews(
  invoices: readonly AmbiguousStripePurchaseCollisionInvoice[],
  work: StripePurchaseCollisionWork,
  query: QueryExecutor,
): Promise<void> {
  if (invoices.length === 0) return
  await query(sql`/* recordStripePurchaseCollisionReviews */
    INSERT INTO membership_stripe_purchase_collision_reviews (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      originating_invoice_id, winning_source_kind, winning_plan, collision_at,
      invoice_line_count, mapped_membership_line_count
    )
    SELECT ${work.sourceId}, ${work.lineageId}, ${work.bindingId},
      input.originating_invoice_id, input.winning_source_kind, input.winning_plan,
      input.collision_at, input.invoice_line_count, input.mapped_membership_line_count
    FROM UNNEST(
      ${invoices.map(invoice => invoice.invoiceId)}::TEXT[],
      ${invoices.map(invoice => invoice.invoiceLineCount)}::INTEGER[],
      ${invoices.map(invoice => invoice.mappedMembershipLineCount)}::INTEGER[],
      ${invoices.map(invoice => invoice.collision.winningSourceKind)}::membership_source_kinds[],
      ${invoices.map(invoice => invoice.collision.winningPlan)}::membership_plan_slugs[],
      ${invoices.map(invoice => invoice.collision.collisionAt)}::TIMESTAMPTZ[]
    ) AS input(originating_invoice_id, invoice_line_count, mapped_membership_line_count,
      winning_source_kind, winning_plan, collision_at)
    WHERE TRUE
    ORDER BY input.originating_invoice_id
    ON CONFLICT (membership_provider_lineage_id, originating_invoice_id) DO NOTHING
  `)
}
