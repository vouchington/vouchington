import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { parsePostgresMoneyAmount } from '@ts-shared/money'
import { groupMembershipSkusByPlan } from '@vouchington/memberships'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import {
  MEMBERSHIP_PRODUCT_CACHE_PREFIXES,
  serializeMembershipProductCacheKey,
  type MembershipProductCacheKey,
} from './cache-schema.mts'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipSourceIdentity,
} from './create-types.mts'
import type { MembershipSku, MembershipPlanSlug } from './types.mts'

const ONE_HOUR_IN_SECONDS = 60 * 60
export const DEFAULT_STRIPE_CATALOG_CONTEXT = {
  environment: STRIPE_PROVIDER_ENVIRONMENT,
  ...DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
} as const

export type StripeCatalogContext = {
  environment: 'test' | 'production'
  applicationId: string
}

const skuByStripePriceIdCache = new ValkeyCache<MembershipProductCacheKey>({
  prefix: MEMBERSHIP_PRODUCT_CACHE_PREFIXES.byStripePriceId,
  ttlSeconds: ONE_HOUR_IN_SECONDS,
  nullTtlSeconds: 5,
  keySerializer: serializeMembershipProductCacheKey,
})

const activePlansCache = new ValkeyCache<MembershipProductCacheKey>({
  prefix: MEMBERSHIP_PRODUCT_CACHE_PREFIXES.activePlans,
  ttlSeconds: ONE_HOUR_IN_SECONDS,
  keySerializer: serializeMembershipProductCacheKey,
})

export async function invalidateMembershipProductCaches(): Promise<void> {
  await ValkeyCache.invalidateMany(Object.values(MEMBERSHIP_PRODUCT_CACHE_PREFIXES))
}

export async function getActivePlans(
  context: StripeCatalogContext = DEFAULT_STRIPE_CATALOG_CONTEXT,
): Promise<Map<MembershipPlanSlug, MembershipSku[]>> {
  const skus = await fetchSkusForActivePlans(context)
  return groupMembershipSkusByPlan(skus)
}

export async function getSkuByStripePriceId(
  stripePriceId: string,
  context: StripeCatalogContext = DEFAULT_STRIPE_CATALOG_CONTEXT,
): Promise<MembershipSku | null> {
  return loadSkuByStripePriceId(stripePriceId, context)
}

async function loadSkuByStripePriceId(
  stripePriceId: string,
  context: StripeCatalogContext,
  query: QueryExecutor = read,
): Promise<MembershipSku | null> {
  const { rows } = await query(
    sql`/* loadSkuByStripePriceId */
    SELECT
      p.id, p.plan, provider_product.price_minor_units, p.billing_interval AS interval, provider_product.currency_code,
      provider_product.provider_product_id AS stripe_price_id, p.retired_at, p.created_at, p.updated_at
    FROM membership_provider_products provider_product
    INNER JOIN membership_products p ON p.id = provider_product.membership_product_id
    WHERE provider_product.provider = 'stripe'
      AND provider_product.provider_product_id = ${stripePriceId}
      AND provider_product.environment = ${context.environment}
      AND provider_product.application_id = ${context.applicationId}
      AND provider_product.retired_at IS NULL
      AND p.retired_at IS NULL
    LIMIT 1
  `,
  )
  return mapMembershipSku(rows[0])
}

/**
 * Resolves the price observed on a Stripe lifecycle event. Historical Stripe events remain
 * interpretable after a provider mapping or canonical product has retired.
 */
export async function getSkuByStripePriceIdForLifecycle(
  stripePriceId: string,
  sourceIdentity: StripeMembershipSourceIdentity,
): Promise<MembershipSku | null> {
  const { rows } = await read(sql`/* getSkuByStripePriceIdForLifecycle */
    SELECT
      p.id, p.plan, provider_product.price_minor_units, p.billing_interval AS interval, provider_product.currency_code,
      provider_product.provider_product_id AS stripe_price_id, p.retired_at, p.created_at, p.updated_at
    FROM membership_provider_products provider_product
    INNER JOIN membership_products p ON p.id = provider_product.membership_product_id
    WHERE provider_product.provider = ${sourceIdentity.provider}
      AND provider_product.provider_product_id = ${stripePriceId}
      AND provider_product.environment = ${sourceIdentity.environment}
      AND provider_product.application_id = ${sourceIdentity.applicationId}
      AND (
        (provider_product.retired_at IS NULL AND p.retired_at IS NULL)
        OR EXISTS (
          SELECT 1
          FROM membership_source_states source_state
          INNER JOIN membership_sources source ON source.id = source_state.membership_source_id
          INNER JOIN membership_provider_lineages lineage
            ON lineage.id = source.membership_provider_lineage_id
          WHERE source.user_id IS NOT NULL
            AND source.source_kind = 'direct'
            AND lineage.provider = ${sourceIdentity.provider}
            AND lineage.environment = ${sourceIdentity.environment}
            AND lineage.application_id = ${sourceIdentity.applicationId}
            AND lineage.provider_lineage_id = ${sourceIdentity.providerLineageId}
        )
      )
    LIMIT 1
  `)
  return mapMembershipSku(rows[0])
}

async function fetchSkusForActivePlans(context: StripeCatalogContext, query: QueryExecutor = read) {
  const { rows } = await query(
    sql`/* fetchSkusForActivePlans */
    SELECT
      p.id, p.plan, stripe_mapping.price_minor_units, p.billing_interval AS interval, stripe_mapping.currency_code,
      stripe_mapping.provider_product_id AS stripe_price_id, p.retired_at, p.created_at, p.updated_at
    FROM membership_products p
    INNER JOIN LATERAL (
      SELECT mapping.price_minor_units, mapping.currency_code, mapping.provider_product_id
      FROM membership_provider_products mapping
      WHERE mapping.membership_product_id = p.id
        AND mapping.provider = 'stripe'
        AND mapping.environment = ${context.environment}
        AND mapping.application_id = ${context.applicationId}
        AND mapping.retired_at IS NULL
      ORDER BY mapping.id DESC
      LIMIT 1
    ) stripe_mapping ON true
    WHERE p.retired_at IS NULL
    ORDER BY p.plan, p.billing_interval
  `,
  )
  return rows.map(mapMembershipSku).filter((sku): sku is MembershipSku => sku !== null)
}

type MembershipSkuRow = Omit<MembershipSku, 'price'> & {
  price_minor_units: string | null
  currency_code: MembershipSku['price']['currency'] | null
}

function mapMembershipSku(row: unknown): MembershipSku | null {
  if (!row) return null
  const { price_minor_units, currency_code, ...sku } = row as MembershipSkuRow
  if (price_minor_units === null || currency_code === null) return null
  return {
    ...sku,
    price: {
      amount: parsePostgresMoneyAmount(price_minor_units),
      currency: currency_code,
    },
  }
}

const getActivePlansCachedFn = activePlansCache.cacheGetByAny(async key =>
  fetchSkusForActivePlans(key),
)

export async function getActivePlansCached(
  context: StripeCatalogContext = DEFAULT_STRIPE_CATALOG_CONTEXT,
): Promise<Map<MembershipPlanSlug, MembershipSku[]>> {
  const skus = (await getActivePlansCachedFn({ ...context, value: 'active' })) ?? []
  return groupMembershipSkusByPlan(skus)
}

const getSkuByStripePriceIdCachedFn = skuByStripePriceIdCache.cacheGetByAny(key =>
  getSkuByStripePriceId(key.value, key),
)

export function getSkuByStripePriceIdCached(
  stripePriceId: string,
  context: StripeCatalogContext = DEFAULT_STRIPE_CATALOG_CONTEXT,
): Promise<MembershipSku | null> {
  return getSkuByStripePriceIdCachedFn({ ...context, value: stripePriceId })
}
