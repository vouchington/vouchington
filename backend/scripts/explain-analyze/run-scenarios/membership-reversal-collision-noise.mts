import { write } from '@data-stores/psql'

/**
 * EXPLAIN-only fixture for collision-work paths. Call once after
 * seedMembershipReversalPlanNoise(prefix) has created the 2,000 owned Stripe sources.
 */
export async function seedMembershipReversalCollisionWorkNoise(input: {
  prefix: string
  source: { id: string; lineageId: string; bindingId: string }
  sourceIdentity: {
    environment: 'test' | 'production'
    applicationId: string
  }
}): Promise<{ workId: string; priceId: string; productId: string }> {
  const { prefix, source, sourceIdentity } = input
  await write(
    `/* seedCollisionNoiseBindings */
     INSERT INTO membership_lineage_bindings (
       membership_provider_lineage_id, user_id, source_kind
     )
     SELECT source.membership_provider_lineage_id, source.user_id, 'direct'
     FROM membership_sources source
     INNER JOIN membership_provider_lineages lineage
       ON lineage.id = source.membership_provider_lineage_id
     INNER JOIN membership_provider_contexts context
       ON context.id = lineage.membership_provider_context_id
     WHERE source.source_kind = 'direct' AND context.provider = 'stripe'
       AND context.environment = 'test' AND context.application_id LIKE $1 || '%'`,
    [prefix],
  )
  await write(
    `/* seedCollisionNoiseWork */
     INSERT INTO membership_stripe_purchase_collision_work_items (
       membership_source_id, membership_provider_lineage_id,
       membership_lineage_binding_id, winning_source_kind, winning_plan, collision_at
     )
     SELECT source.id, source.membership_provider_lineage_id, binding.id,
       'family', 'plus', TIMESTAMPTZ '2025-01-01 00:00:00+00' +
         (row_number() OVER (ORDER BY source.id) * INTERVAL '1 second')
     FROM membership_sources source
     INNER JOIN membership_provider_lineages lineage
       ON lineage.id = source.membership_provider_lineage_id
     INNER JOIN membership_provider_contexts context
       ON context.id = lineage.membership_provider_context_id
     INNER JOIN membership_lineage_bindings binding
       ON binding.membership_provider_lineage_id = lineage.id
       AND binding.user_id = source.user_id AND binding.source_kind = 'direct'
       AND binding.released_at IS NULL
     WHERE source.source_kind = 'direct' AND context.provider = 'stripe'
       AND context.environment = 'test' AND context.application_id LIKE $1 || '%'`,
    [prefix],
  )

  const { rows: noiseProducts } = await write<{ id: string }>(
    `/* seedCollisionNoiseProviderProducts */
     WITH products AS (
       INSERT INTO membership_products (plan, billing_interval, retired_at)
       SELECT 'plus', 'monthly', CURRENT_TIMESTAMP FROM generate_series(1, 2000)
       RETURNING id
     ), context AS (
       SELECT fn_upsert_membership_provider_context_id('stripe', $1, $2) AS id
     )
     INSERT INTO membership_provider_products (
       membership_product_id, membership_provider_context_id, provider_product_id
     )
     SELECT products.id, context.id,
       $3 || '-noise-price-' || row_number() OVER (ORDER BY products.id)
     FROM products CROSS JOIN context
     RETURNING id`,
    [sourceIdentity.environment, sourceIdentity.applicationId, prefix],
  )
  if (noiseProducts.length !== 2000)
    throw new Error('Expected 2,000 unrelated Stripe provider products for EXPLAIN')

  const { rows: productRows } = await write<{ id: string }>(
    `/* seedCollisionTargetProduct */
     INSERT INTO membership_products (plan, billing_interval, retired_at)
     VALUES ('plus', 'monthly', CURRENT_TIMESTAMP) RETURNING id`,
  )
  const productId = productRows[0]?.id
  if (!productId) throw new Error('Expected collision target membership product')
  const priceId = `${prefix}-target-price`
  await write(
    `/* seedCollisionTargetProviderProduct */
     INSERT INTO membership_provider_products (
       membership_product_id, membership_provider_context_id, provider_product_id
     ) VALUES (
       $1, fn_upsert_membership_provider_context_id('stripe', $2, $3), $4
     )`,
    [productId, sourceIdentity.environment, sourceIdentity.applicationId, priceId],
  )

  const { rows: workRows } = await write<{ id: string }>(
    `/* seedCollisionTargetWork */
     INSERT INTO membership_stripe_purchase_collision_work_items (
       membership_source_id, membership_provider_lineage_id,
       membership_lineage_binding_id, winning_source_kind, winning_plan, collision_at
     ) VALUES ($1, $2, $3, 'direct', 'plus', TIMESTAMPTZ '2025-02-01 00:00:00+00')
     RETURNING id`,
    [source.id, source.lineageId, source.bindingId],
  )
  const workId = workRows[0]?.id
  if (!workId) throw new Error('Expected target Stripe purchase collision work')
  await write(`/* analyzeCollisionWorkNoise */ ANALYZE
    membership_stripe_purchase_collision_work_items,
    membership_provider_products, membership_products,
    membership_sources, membership_provider_lineages,
    membership_provider_contexts, membership_lineage_bindings`)
  return { workId, priceId, productId }
}
