import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestStripeCatalogMapping = {
  membership_product_id: string
  provider_product_id: string
  retired_at: Date | null
  sku_id: string | null
}

export async function clearTestStripeCatalogMappings(applicationId: string): Promise<void> {
  await write(sql`/* clearTestStripeCatalogMappings */
    DELETE FROM membership_provider_products WHERE application_id = ${applicationId}`)
}

export async function getTestStripeCatalogMappings(
  applicationId: string,
  environment: 'test' | 'production',
): Promise<TestStripeCatalogMapping[]> {
  const { rows } = await read<TestStripeCatalogMapping>(sql`/* getTestStripeCatalogMappings */
    SELECT membership_product_id, provider_product_id, sku_id, retired_at
    FROM membership_provider_products
    WHERE provider = 'stripe' AND environment = ${environment}
      AND application_id = ${applicationId}
    ORDER BY sku_id, provider_product_id`)
  return rows
}

export async function createConflictingTestStripeCatalogMapping(
  applicationId: string,
  skuId: string,
  environment: 'test' | 'production',
): Promise<void> {
  await write(sql`/* createConflictingTestStripeCatalogMapping */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id,
      sku_id, price_minor_units, currency_code
    )
    SELECT id, 'stripe', ${environment}, ${applicationId}, 'price_catalog_conflict',
      ${skuId}, 500, 'usd'
    FROM membership_products
    WHERE plan = 'pro' AND billing_interval = 'monthly' AND retired_at IS NULL`)
}
