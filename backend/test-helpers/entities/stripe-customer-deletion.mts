import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function addTestStripeDeletionWork(
  requestId: string,
  customerId: string,
): Promise<void> {
  await write(sql`/* addTestStripeDeletionWork */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (
        membership_provider_context_id, provider_lineage_id, provider_account_id
      ) VALUES (
        fn_upsert_membership_provider_context_id('stripe', 'test', 'voucha-web'),
        ${`sub_test_deletion_${randomUUID()}`}, ${customerId}
      ) RETURNING id
    )
    INSERT INTO user_deletion_external_works (request_id, work_kind, membership_provider_lineage_id)
    SELECT ${requestId}, 'stripe-customer', id FROM lineage
  `)
}

export async function addTestSharedStripeCustomerSources(
  userId: string,
  customerId: string,
): Promise<void> {
  await write(sql`/* addTestSharedStripeCustomerSources */
    WITH provider_context AS (
      SELECT fn_upsert_membership_provider_context_id('stripe', 'test', 'voucha-web') AS id
    ), lineages AS (
      INSERT INTO membership_provider_lineages (
        membership_provider_context_id, provider_lineage_id, provider_account_id
      )
      SELECT provider_context.id, identity.lineage_id, ${customerId}
      FROM provider_context
      CROSS JOIN (VALUES (${randomUUID()}), (${randomUUID()})) AS identity(lineage_id)
      RETURNING id
    )
    INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
    SELECT ${userId}, 'direct', id FROM lineages
  `)
}

export async function countTestStripeCustomerDeletionWorks(requestId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTestStripeCustomerDeletionWorks */
    SELECT COUNT(*)::int AS count FROM user_deletion_external_works
    WHERE request_id = ${requestId} AND work_kind = 'stripe-customer'`)
  return rows[0]?.count ?? 0
}
