import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import type { MembershipCatalogProduct } from '@services/memberships/provider-catalog'
import { membershipAdditionalWorkMaxValues } from '@services/memberships/work-limits'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'
import sql from 'sql-template-strings'
import { seedUuid } from './common.mts'

const grantLimit = membershipAdditionalWorkMaxValues.outstanding_grants_per_user
const grantStart = 705_000
const catalogPrefix = 'explain-catalog-capacity-'
const catalogProviders = ['stripe', 'apple_app_store', 'google_play', 'microsoft_store'] as const
// Leave room in each selected context for the baseline catalog mapping.
const mappingsPerProductContext = membershipAdditionalWorkMaxValues.active_provider_mappings - 1

export async function seedOutstandingMembershipGrantCapacity() {
  const userId = seedUuid(grantStart, '01')
  const otherUserId = seedUuid(grantStart + 1, '01')
  // Each excluded row sorts before the target grants, so omitting a filter displaces a valid ID.
  const grants = Array.from({ length: grantLimit + 3 }, (_, index) => ({
    id: seedUuid(grantStart + index, '3a'),
    sourceId: seedUuid(grantStart + index, '33'),
    userId: index === 0 ? otherUserId : userId,
    revoked: index === 1,
    expired: index === 2,
  }))
  await using query = await beginTransaction()
  await query(sql`/* seedOutstandingGrantCapacity:users */
    INSERT INTO users (id, username)
    VALUES (${userId}, 'explaincapacitygrantowner'), (${otherUserId}, 'explaincapacitygrantother')
    ON CONFLICT (id) DO NOTHING`)
  await query(sql`/* seedOutstandingGrantCapacity:sources */
    INSERT INTO membership_sources (id, user_id, source_kind)
    SELECT source_id, user_id, 'admin_grant'
    FROM unnest(${grants.map(grant => grant.sourceId)}::uuid[], ${grants.map(grant => grant.userId)}::uuid[])
      AS input(source_id, user_id)
    ON CONFLICT (id) DO NOTHING`)
  await query(sql`/* seedOutstandingGrantCapacity:grants */
    INSERT INTO membership_grants (id, membership_source_id, user_id, membership_product_id,
      calendar_days, issuer_snapshot, revoked_at, revoked_by_id, revocation_reason)
    SELECT input.id, input.source_id, input.user_id, product.id, 30, 'EXPLAIN grant capacity',
      CASE WHEN revoked THEN CURRENT_TIMESTAMP END,
      CASE WHEN revoked THEN ${otherUserId}::uuid END,
      CASE WHEN revoked THEN 'EXPLAIN revoked grant' END
    FROM unnest(${grants.map(grant => grant.id)}::uuid[], ${grants.map(grant => grant.sourceId)}::uuid[],
      ${grants.map(grant => grant.userId)}::uuid[], ${grants.map(grant => grant.revoked)}::boolean[])
      AS input(id, source_id, user_id, revoked)
    CROSS JOIN membership_products product
    WHERE product.plan = 'plus' AND product.billing_interval = 'monthly' AND product.retired_at IS NULL
    ON CONFLICT (id) DO NOTHING`)
  await query(sql`/* seedOutstandingGrantCapacity:states */
    INSERT INTO membership_source_states (membership_source_id, source_kind, membership_product_id,
      effective_at, expired_at)
    SELECT input.source_id, 'admin_grant', product.id, CURRENT_TIMESTAMP - INTERVAL '31 days',
      CASE WHEN expired THEN CURRENT_TIMESTAMP - INTERVAL '1 day' END
    FROM unnest(${grants.map(grant => grant.sourceId)}::uuid[], ${grants.map(grant => grant.expired)}::boolean[])
      AS input(source_id, expired)
    CROSS JOIN membership_products product
    WHERE product.plan = 'plus' AND product.billing_interval = 'monthly' AND product.retired_at IS NULL
    ON CONFLICT (membership_source_id) DO NOTHING`)
  await query.commit()
  await write(
    '/* analyzeOutstandingGrantCapacity */ ANALYZE membership_grants, membership_source_states',
  )
  return { userId, ids: grants.slice(3).map(grant => grant.id) }
}

export async function seedMembershipCatalogReadCapacity(): Promise<{
  prefix: string
  products: MembershipCatalogProduct[]
}> {
  await using query = await beginTransaction()
  const { rows: products } = await query<Omit<MembershipCatalogProduct, 'providers'>>(sql`
    /* seedMembershipCatalogCapacity:activeProducts */
    SELECT id, plan, billing_interval AS interval FROM membership_products
    WHERE retired_at IS NULL ORDER BY plan, billing_interval`)
  assert.equal(products.length, 4)
  const expected: MembershipCatalogProduct[] = products.map(product => ({
    ...product,
    providers: [],
  }))
  for (const provider of catalogProviders) {
    const { applicationId, environment } = getMembershipProviderContext(provider)
    const { rows: contexts } = await query<{
      selected: string
      other_application: string
      other_environment: string
    }>(
      sql`/* seedMembershipCatalogCapacity:contexts */
        SELECT fn_upsert_membership_provider_context_id(${provider}, ${environment}, ${applicationId}) AS selected,
          fn_upsert_membership_provider_context_id(${provider}, ${environment}, ${catalogPrefix + provider}) AS other_application,
          fn_upsert_membership_provider_context_id(${provider}, ${environment === 'test' ? 'production' : 'test'},
            ${applicationId}) AS other_environment`,
    )
    const { selected, other_application, other_environment } = contexts[0]!
    const rows = expected.flatMap(product =>
      Array.from({ length: mappingsPerProductContext }, (_, index) => {
        const key = `${catalogPrefix}${provider}-${product.plan}-${product.interval}-${index}`
        const reference = {
          provider,
          environment,
          application_id: applicationId,
          product_id: key,
          base_plan_id: provider === 'google_play' ? 'base-plan' : null,
          offer_id: provider === 'google_play' ? 'offer' : null,
          sku_id: provider === 'stripe' || provider === 'microsoft_store' ? key : null,
          price:
            provider === 'apple_app_store'
              ? null
              : { amount: 500 + index, currency: 'usd' as const },
        }
        product.providers.push(reference)
        return { id: product.id, reference }
      }),
    )
    await query(sql`/* seedMembershipCatalogCapacity:mappings */
      INSERT INTO membership_provider_products (membership_product_id, membership_provider_context_id,
        provider_product_id, base_plan_id, offer_id, sku_id, price_minor_units, currency_code, retired_at)
      SELECT input.product_id, context.id, input.provider_product_id || context.suffix, input.base_plan_id,
        input.offer_id, input.sku_id, input.amount, CASE WHEN input.amount IS NOT NULL THEN 'usd'::currency_codes END,
        CASE WHEN context.suffix = '-retired' THEN CURRENT_TIMESTAMP END
      FROM unnest(${rows.map(row => row.id)}::uuid[], ${rows.map(row => row.reference.product_id)}::text[],
        ${rows.map(row => row.reference.base_plan_id)}::text[], ${rows.map(row => row.reference.offer_id)}::text[],
        ${rows.map(row => row.reference.sku_id)}::text[], ${rows.map(row => row.reference.price?.amount ?? null)}::bigint[])
        AS input(product_id, provider_product_id, base_plan_id, offer_id, sku_id, amount)
      CROSS JOIN (VALUES (${selected}::uuid, ''), (${selected}::uuid, '-retired'),
        (${other_application}::uuid, '-other-app'), (${other_environment}::uuid, '-other-environment'))
        AS context(id, suffix)
      ON CONFLICT (membership_provider_context_id, provider_product_id, base_plan_id, offer_id, sku_id) DO NOTHING`)
  }
  await query.commit()
  await write(`/* analyzeMembershipCatalogReadCapacity */ ANALYZE
    membership_products, membership_provider_contexts, membership_provider_products`)
  return { prefix: catalogPrefix, products: expected }
}

export async function deleteMembershipCatalogReadCapacityMappings(prefix: string): Promise<void> {
  await write(sql`/* deleteMembershipCatalogReadCapacityMappings */
    DELETE FROM membership_provider_products WHERE starts_with(provider_product_id, ${prefix})`)
}
