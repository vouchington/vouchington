import { write } from '@data-stores/psql'

/** Unrelated active memberships and provider contexts make keyed lookups representative. */
export async function seedMembershipReversalPlanNoise(prefix: string): Promise<void> {
  await write(
    `/* seedMembershipReversalPlanNoise */
    WITH fixture AS MATERIALIZED (
      SELECT $1::text || n::text AS name FROM generate_series(1, 2000) n
    ), users_inserted AS (
      INSERT INTO users (username) SELECT name FROM fixture RETURNING id, username
    ), lineages AS (
      INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      SELECT fn_upsert_membership_provider_context_id('stripe', 'test', name), name FROM fixture
      RETURNING id, provider_lineage_id
    ), sources AS (
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      SELECT users_inserted.id, 'direct', lineages.id FROM users_inserted
      JOIN lineages ON lineages.provider_lineage_id = users_inserted.username
      RETURNING id, user_id
    ), product AS (
      INSERT INTO membership_products (plan, billing_interval, retired_at)
      VALUES ('plus', 'monthly', CURRENT_TIMESTAMP) RETURNING id
    ) INSERT INTO memberships (user_id, membership_source_id, membership_product_id, effective_at)
      SELECT sources.user_id, sources.id, product.id, NOW() - INTERVAL '1 day'
      FROM sources CROSS JOIN product`,
    [prefix],
  )
  await write(`/* seedMembershipReversalPlanProducts */
    INSERT INTO membership_products (plan, billing_interval, retired_at)
    SELECT 'plus', 'monthly', CURRENT_TIMESTAMP FROM generate_series(1, 2000)`)
  await Promise.all(
    [
      'users',
      'memberships',
      'membership_sources',
      'membership_products',
      'membership_provider_lineages',
      'membership_provider_contexts',
    ].map(relation => write(`/* analyzeMembershipReversalPlanNoise */ ANALYZE ${relation}`)),
  )
}
