import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestStripePurchaseCollisionWork = {
  id: string
  source_id: string
  membership_provider_lineage_id: string
  membership_lineage_binding_id: string
  winning_source_kind: 'direct' | 'family'
  winning_plan: 'plus' | 'pro'
  collision_at: Date
}

/** Read only pending work for the owned source and collision timestamp. */
export async function readTestStripePurchaseCollisionWork(
  sourceId: string,
  collisionAt: Date,
): Promise<TestStripePurchaseCollisionWork | null> {
  const { rows } = await read<TestStripePurchaseCollisionWork>(sql`
    /* readTestStripePurchaseCollisionWork */
    SELECT work.id, work.membership_source_id AS source_id,
      work.membership_provider_lineage_id, work.membership_lineage_binding_id,
      work.winning_source_kind, work.winning_plan, work.collision_at
    FROM membership_stripe_purchase_collision_work_items work
    WHERE work.membership_source_id = ${sourceId}
      AND work.collision_at = ${collisionAt}
    ORDER BY work.id LIMIT 1
  `)
  return rows[0] ?? null
}

export type TestStripePurchaseCollisionReview = {
  membership_source_id: string
  membership_provider_lineage_id: string
  membership_lineage_binding_id: string
  originating_invoice_id: string
  winning_source_kind: 'direct' | 'family'
  winning_plan: 'plus' | 'pro'
  collision_at: Date
  invoice_line_count: number
  mapped_membership_line_count: number
}

/** Read one invoice review owned by the test source. */
export async function readTestStripePurchaseCollisionReview(
  sourceId: string,
  invoiceId: string,
): Promise<TestStripePurchaseCollisionReview | null> {
  const { rows } = await read<TestStripePurchaseCollisionReview>(sql`
    /* readTestStripePurchaseCollisionReview */
    SELECT membership_source_id, membership_provider_lineage_id,
      membership_lineage_binding_id, originating_invoice_id,
      winning_source_kind, winning_plan, collision_at,
      invoice_line_count, mapped_membership_line_count
    FROM membership_stripe_purchase_collision_reviews
    WHERE membership_source_id = ${sourceId}
      AND originating_invoice_id = ${invoiceId}
    LIMIT 1
  `)
  return rows[0] ?? null
}
