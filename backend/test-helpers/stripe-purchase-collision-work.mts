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
