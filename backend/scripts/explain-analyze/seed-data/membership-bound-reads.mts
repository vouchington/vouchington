import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUuid } from './common.mts'

export const MEMBERSHIP_BOUND_READ_COUNT = 3_000
const start = 700_000
export const membershipBoundReadFixture = {
  grantUserId: seedUuid(start, '01'),
  grantWinnerSourceId: seedUuid(start + 1, '33'),
  applicationId: 'explain-membership-bound-read-corpus',
  currentSubscriptionId: 'explain-membership-current-refund',
  historicalSubscriptionId: 'explain-membership-historical-refund',
  currentMembershipId: seedUuid(start + MEMBERSHIP_BOUND_READ_COUNT - 1, '31'),
  historicalMembershipId: seedUuid(start + 2 * MEMBERSHIP_BOUND_READ_COUNT - 1, '31'),
}

/** Heavy owners supplement the existing cross-owner membership corpus, rather than replacing it. */
export async function seedMembershipBoundReads(): Promise<Date> {
  await using query = await beginTransaction()
  await query(sql`/* seedMembershipBoundReads:owners */
    INSERT INTO users (id, username)
    SELECT input.id, 'explainboundowner' || SUBSTRING(input.id::text FROM 25 FOR 12)
    FROM unnest(${[0, 1, 2].map(index => seedUuid(start + index, '01'))}::uuid[])
      WITH ORDINALITY input(id, ordinal)
    ON CONFLICT DO NOTHING`)
  const ids = Array.from({ length: MEMBERSHIP_BOUND_READ_COUNT }, (_, index) => start + index)
  const sourceIds = ids.map(index => seedUuid(index, '33'))
  const grantIds = ids.map(index => seedUuid(index, '3a'))
  await query(sql`/* seedMembershipBoundReads:grantSources */
    INSERT INTO membership_sources (id, user_id, source_kind)
    SELECT id, ${membershipBoundReadFixture.grantUserId}, 'admin_grant'
    FROM unnest(${sourceIds}::uuid[]) requested(id) ON CONFLICT DO NOTHING`)
  await query(sql`/* seedMembershipBoundReads:grants */
    INSERT INTO membership_grants (id, membership_source_id, user_id,
      membership_product_id, calendar_days, issuer_snapshot)
    SELECT input.grant_id, input.source_id, ${membershipBoundReadFixture.grantUserId},
      product.id, 30, 'EXPLAIN bounded membership read'
    FROM unnest(${grantIds}::uuid[], ${sourceIds}::uuid[]) WITH ORDINALITY input(grant_id, source_id, ordinal)
    JOIN membership_products product
      ON product.plan = CASE WHEN input.ordinal % 2 = 0 THEN 'pro' ELSE 'plus' END::membership_plan_slugs
      AND product.billing_interval = 'monthly' AND product.retired_at IS NULL
    ON CONFLICT DO NOTHING`)
  const { rows: clock } = await query<{ at: Date }>(sql`/* seedMembershipBoundReads:clock */
    SELECT uuid_extract_timestamp(${seedUuid(0, '3b')}::uuid) AS at`)
  const at = clock[0]!.at
  const bindingAt = new Date(at.getTime() - 24 * 60 * 60 * 1_000)
  const releasedAt = new Date(at.getTime() + 24 * 60 * 60 * 1_000)
  const { rows: contexts } = await query<{ id: string }>(sql`/* seedMembershipBoundReads:context */
    SELECT fn_upsert_membership_provider_context_id('stripe', 'test', ${membershipBoundReadFixture.applicationId}) AS id`)
  // Keep provider-context and lineage-binding lookups indexed when running without reversal noise.
  const { rows: bindingCounts } = await query<{ count: number }>(
    sql`/* seedMembershipBoundReads:bindingCount */ SELECT count(*)::int AS count FROM membership_lineage_bindings`,
  )
  if ((bindingCounts[0]?.count ?? 0) < 1_000) {
    await query(sql`/* seedMembershipBoundReads:contextAndBindingNoise */
      WITH fixture AS (
        SELECT n, 'explain-bound-read-context-' || n AS name FROM generate_series(1, 1000) AS n
      ), lineages AS (
        INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
        SELECT fn_upsert_membership_provider_context_id('stripe', 'test', name), name FROM fixture
        ON CONFLICT DO NOTHING
        RETURNING id
      ), sources AS (
        INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
        SELECT ${membershipBoundReadFixture.grantUserId}, 'direct', id FROM lineages
        ON CONFLICT DO NOTHING
        RETURNING membership_provider_lineage_id
      )
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id, source_kind)
      SELECT membership_provider_lineage_id, ${membershipBoundReadFixture.grantUserId}, 'direct'
      FROM sources
      ON CONFLICT DO NOTHING`)
  }
  await seedRefundTargetCase(
    query,
    0,
    membershipBoundReadFixture.currentSubscriptionId,
    ids,
    contexts[0]!.id,
    bindingAt,
    releasedAt,
  )
  await seedRefundTargetCase(
    query,
    1,
    membershipBoundReadFixture.historicalSubscriptionId,
    ids,
    contexts[0]!.id,
    bindingAt,
    releasedAt,
  )
  await query.commit()
  await write(`/* seedMembershipBoundReads:analyze */ ANALYZE
    membership_sources, membership_grants, membership_products, membership_source_states,
    membership_grant_activation_periods, membership_provider_lineages,
    membership_provider_contexts, membership_lineage_bindings, memberships, membership_changes`)
  return at
}

async function seedRefundTargetCase(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  ordinal: 0 | 1,
  subscriptionId: string,
  ids: readonly number[],
  contextId: string,
  bindingAt: Date,
  releasedAt: Date,
): Promise<void> {
  const lineageId = seedUuid(start + ordinal, '3c')
  const sourceId = seedUuid(start + MEMBERSHIP_BOUND_READ_COUNT + ordinal, '33')
  const bindingId = seedUuid(start + ordinal, '3d')
  const userId = seedUuid(start + ordinal + 1, '01')
  const membershipIds = ids.map(index =>
    seedUuid(index + ordinal * MEMBERSHIP_BOUND_READ_COUNT, '31'),
  )
  const changeIds = ids.map(index => seedUuid(index + ordinal * MEMBERSHIP_BOUND_READ_COUNT, '3b'))
  await query(sql`/* seedMembershipBoundReads:lineage */
    INSERT INTO membership_provider_lineages (id, membership_provider_context_id, provider_lineage_id)
    VALUES (${lineageId}, ${contextId}, ${subscriptionId}) ON CONFLICT DO NOTHING`)
  await query(sql`/* seedMembershipBoundReads:source */
    INSERT INTO membership_sources (id, user_id, source_kind, membership_provider_lineage_id)
    VALUES (${sourceId}, ${userId}, 'direct', ${lineageId}) ON CONFLICT DO NOTHING`)
  await query(sql`/* seedMembershipBoundReads:binding */
    INSERT INTO membership_lineage_bindings (id, membership_provider_lineage_id, user_id,
      source_kind, bound_at, released_at, release_reason)
    VALUES (${bindingId}, ${lineageId}, ${userId}, 'direct', ${bindingAt},
      ${ordinal === 1 ? releasedAt : null}, ${ordinal === 1 ? 'explain_closed_binding' : null})
    ON CONFLICT DO NOTHING`)
  await query(sql`/* seedMembershipBoundReads:projections */
    INSERT INTO memberships (id, user_id, membership_source_id, membership_product_id,
      effective_at, projection_ended_at)
    SELECT input.id, ${userId}, ${sourceId}, product.id, ${bindingAt}, ${releasedAt}
    FROM unnest(${membershipIds}::uuid[]) input(id)
    CROSS JOIN (SELECT id FROM membership_products WHERE plan = 'plus'
      AND billing_interval = 'monthly' AND retired_at IS NULL) product
    ON CONFLICT DO NOTHING`)
  await query(sql`/* seedMembershipBoundReads:history */
    INSERT INTO membership_changes (id, membership_id, user_id, membership_source_id, change_type)
    SELECT input.change_id, input.membership_id, ${userId}, ${sourceId}, 'source_observed'
    FROM unnest(${changeIds}::uuid[], ${membershipIds}::uuid[]) input(change_id, membership_id)
    ON CONFLICT DO NOTHING`)
}
