import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { TestReversalCaseFixture } from './data-stores/psql/membership-reversal-cases.mts'

export async function insertTestStripeCollisionWork(fixture: TestReversalCaseFixture) {
  const { rows } = await write<{ id: string }>(sql`/* insertTestStripeCollisionWork */
    INSERT INTO membership_stripe_purchase_collision_work_items (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      winning_source_kind, winning_plan, collision_at
    ) VALUES (${fixture.sourceId}, ${fixture.membershipProviderLineageId}, ${fixture.bindingId},
      'direct', 'plus', CURRENT_TIMESTAMP)
    RETURNING id
  `)
  return rows[0]!.id
}

export async function mutateTestStripeCollisionWork(id: string) {
  await write(sql`/* mutateTestStripeCollisionWork */
    UPDATE membership_stripe_purchase_collision_work_items SET winning_plan = 'pro'
    WHERE id = ${id}
  `)
}
