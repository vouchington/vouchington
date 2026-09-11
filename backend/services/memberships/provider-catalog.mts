import { write } from '@data-stores/psql'
import { parsePostgresMoneyAmount, type Money } from '@ts-shared/money'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'
import sql from 'sql-template-strings'
import type { MembershipBillingInterval, MembershipPlanSlug } from './types.mts'
import type { MembershipPurchaseProvider } from './purchase-intents.mts'

export type MembershipCatalogProviderReference = {
  provider: MembershipPurchaseProvider
  environment: 'test' | 'production'
  application_id: string
  product_id: string
  base_plan_id: string | null
  offer_id: string | null
  sku_id: string | null
  price: Money | null
}

export type MembershipCatalogProduct = {
  id: string
  plan: MembershipPlanSlug
  interval: MembershipBillingInterval
  providers: MembershipCatalogProviderReference[]
}

type CatalogRow = {
  id: string
  plan: MembershipPlanSlug
  interval: MembershipBillingInterval
  provider: MembershipPurchaseProvider | null
  environment: 'test' | 'production' | null
  application_id: string | null
  provider_product_id: string | null
  base_plan_id: string | null
  offer_id: string | null
  sku_id: string | null
  price_minor_units: string | null
  currency_code: string | null
}

export async function getActiveMembershipCatalogFromPrimary(): Promise<MembershipCatalogProduct[]> {
  const { rows } = await write<CatalogRow>(sql`/* getActiveMembershipCatalogFromPrimary */
    SELECT product.id, product.plan, product.billing_interval AS interval,
      mapping.provider, mapping.environment, mapping.application_id,
      mapping.provider_product_id, mapping.base_plan_id, mapping.offer_id, mapping.sku_id,
      mapping.price_minor_units, mapping.currency_code
    FROM membership_products product
    LEFT JOIN membership_provider_products mapping
      ON mapping.membership_product_id = product.id AND mapping.retired_at IS NULL
    WHERE product.retired_at IS NULL
    ORDER BY product.plan, product.billing_interval, mapping.provider, mapping.application_id,
      mapping.id DESC`)
  const products = new Map<string, MembershipCatalogProduct>()
  for (const row of rows) {
    const product = products.get(row.id) ?? {
      id: row.id,
      plan: row.plan,
      interval: row.interval,
      providers: [],
    }
    products.set(row.id, product)
    if (
      row.provider === null ||
      row.environment === null ||
      row.application_id === null ||
      row.provider_product_id === null
    )
      continue
    const context = getMembershipProviderContext(row.provider)
    if (row.environment !== context.environment || row.application_id !== context.applicationId)
      continue
    const hasPrice = row.price_minor_units !== null && row.currency_code !== null
    product.providers.push({
      provider: row.provider,
      environment: row.environment,
      application_id: row.application_id,
      product_id: row.provider_product_id,
      base_plan_id: row.base_plan_id,
      offer_id: row.offer_id,
      sku_id: row.sku_id,
      price: hasPrice
        ? {
            amount: parsePostgresMoneyAmount(row.price_minor_units as string),
            currency: row.currency_code as Money['currency'],
          }
        : null,
    })
  }
  return [...products.values()]
}
