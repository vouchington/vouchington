import { type TransactionQuery, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { StripeCatalogContext } from './get-catalog.mts'

export async function publishStripeCatalogMapping({
  membershipProductId,
  providerProductId,
  skuId,
  amount,
  context,
  query,
}: {
  membershipProductId: string
  providerProductId: string
  skuId: string
  amount: number
  context: StripeCatalogContext
  query: TransactionQuery
}): Promise<void> {
  const existing = await findStripeCatalogMappings(providerProductId, skuId, context, query)
  for (const mapping of existing) {
    const reusesProviderPrice = mapping.provider_product_id === providerProductId
    const reusesCatalogKey = mapping.sku_id === skuId
    if (
      (reusesProviderPrice &&
        (!reusesCatalogKey || mapping.membership_product_id !== membershipProductId)) ||
      (reusesCatalogKey &&
        (mapping.membership_product_id !== membershipProductId ||
          Number(mapping.price_minor_units) !== amount ||
          mapping.currency_code !== 'usd'))
    )
      throw new Error(`Stripe catalog mapping ${skuId} conflicts with its canonical identity`)
  }
  if (
    !existing.some(
      mapping => mapping.provider_product_id === providerProductId && mapping.sku_id === skuId,
    )
  ) {
    await write(
      sql`/* publishStripeCatalogMapping: insert */
        INSERT INTO membership_provider_products (membership_product_id, membership_provider_context_id, provider_product_id, sku_id, price_minor_units, currency_code)
        VALUES (${membershipProductId}, fn_upsert_membership_provider_context_id('stripe', ${context.environment}, ${context.applicationId}), ${providerProductId}, ${skuId}, ${amount}, 'usd')
        ON CONFLICT DO NOTHING`,
      { query },
    )
  }
  const mappings = await findStripeCatalogMappings(providerProductId, skuId, context, query)
  const exact = mappings.filter(
    mapping => mapping.provider_product_id === providerProductId && mapping.sku_id === skuId,
  )
  if (exact.length !== 1) throw new Error(`Stripe catalog mapping ${skuId} is ambiguous`)
  const mapping = exact[0]!
  if (
    mapping.membership_product_id !== membershipProductId ||
    Number(mapping.price_minor_units) !== amount ||
    mapping.currency_code !== 'usd'
  )
    /* v8 ignore next -- defensive: the locked pre-read and database uniqueness prevent this drift. */
    throw new Error(`Stripe catalog mapping ${skuId} conflicts with its canonical identity`)
  if (mapping.retired_at === null) return
  await write(
    sql`/* publishStripeCatalogMapping: reactivate */
      UPDATE membership_provider_products SET retired_at = NULL WHERE id = ${mapping.id}`,
    { query },
  )
}

async function findStripeCatalogMappings(
  providerProductId: string,
  skuId: string,
  context: StripeCatalogContext,
  query: TransactionQuery,
): Promise<StripeCatalogMapping[]> {
  const { rows } = await write(
    sql`/* findStripeCatalogMappings */
      SELECT mapping.id, mapping.membership_product_id, mapping.provider_product_id,
        mapping.sku_id, mapping.price_minor_units, mapping.currency_code, mapping.retired_at
      FROM membership_provider_products mapping
      INNER JOIN membership_provider_contexts provider_context
        ON provider_context.id = mapping.membership_provider_context_id
      WHERE provider_context.provider = 'stripe'
        AND provider_context.environment = ${context.environment}
        AND provider_context.application_id = ${context.applicationId}
        AND (mapping.provider_product_id = ${providerProductId} OR mapping.sku_id = ${skuId})
      FOR NO KEY UPDATE OF mapping`,
    { query },
  )
  return rows as StripeCatalogMapping[]
}

type StripeCatalogMapping = {
  id: string
  membership_product_id: string
  provider_product_id: string
  sku_id: string
  price_minor_units: string | null
  currency_code: string | null
  retired_at: Date | null
}
