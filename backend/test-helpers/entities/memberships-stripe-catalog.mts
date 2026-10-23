import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  MembershipBillingInterval,
  MembershipPlanSlug,
} from '@voucha/types/entities/membership'

export type TestStripeCatalogMapping = {
  membership_product_id: string
  provider_product_id: string
  retired_at: Date | null
  product_retired_at: Date | null
  sku_id: string | null
  plan: MembershipPlanSlug
  billing_interval: MembershipBillingInterval
  price_minor_units: string
  currency_code: string
}

export async function clearTestStripeCatalogMappings(applicationId: string): Promise<void> {
  await write(sql`/* clearTestStripeCatalogMappings */
    DELETE FROM membership_provider_products product
    USING membership_provider_contexts context
    WHERE context.id = product.membership_provider_context_id
      AND context.application_id = ${applicationId}`)
}

export async function getTestStripeCatalogMappings(
  applicationId: string,
  environment: 'test' | 'production',
): Promise<TestStripeCatalogMapping[]> {
  const { rows } = await read<TestStripeCatalogMapping>(sql`/* getTestStripeCatalogMappings */
    SELECT product.membership_product_id, product.provider_product_id, product.sku_id, product.retired_at,
      canonical_product.plan, canonical_product.billing_interval, canonical_product.retired_at AS product_retired_at,
      product.price_minor_units::text AS price_minor_units, product.currency_code
    FROM membership_provider_products product
    JOIN membership_provider_contexts context ON context.id = product.membership_provider_context_id
    JOIN membership_products canonical_product ON canonical_product.id = product.membership_product_id
    WHERE context.provider = 'stripe' AND context.environment = ${environment}
      AND context.application_id = ${applicationId}
    ORDER BY product.sku_id, product.provider_product_id`)
  return rows
}

export async function createConflictingTestStripeCatalogMapping(
  applicationId: string,
  skuId: string,
  environment: 'test' | 'production',
): Promise<void> {
  await write(sql`/* createConflictingTestStripeCatalogMapping */
    INSERT INTO membership_provider_products (
      membership_product_id, membership_provider_context_id, provider_product_id,
      sku_id, price_minor_units, currency_code
    )
    SELECT id, fn_upsert_membership_provider_context_id('stripe', ${environment}, ${applicationId}), 'price_catalog_conflict',
      ${skuId}, 500, 'usd'
    FROM membership_products
    WHERE plan = 'pro' AND billing_interval = 'monthly' AND retired_at IS NULL`)
}
