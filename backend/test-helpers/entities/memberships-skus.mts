import { write } from '@data-stores/psql'
import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import type {
  MembershipPlanSlug,
  MembershipBillingInterval,
} from '@voucha/types/entities/membership'

export type CreateTestSkuOptions = {
  id?: string
  plan?: MembershipPlanSlug
  price_minor_units?: number
  interval?: MembershipBillingInterval
  currency_code?: string
  stripe_price_id?: string
  provider_environment?: 'test' | 'production'
  provider_application_id?: string
}

type TestMembershipProduct = {
  id: string
  plan: MembershipPlanSlug
  interval: MembershipBillingInterval
  created_at: Date
  updated_at: Date
}

export async function createTestSkuRecord(options: CreateTestSkuOptions = {}) {
  const plan = options.plan ?? 'plus'
  const price_minor_units = options.price_minor_units ?? 500
  const interval = options.interval ?? 'monthly'
  const currency_code = options.currency_code ?? 'usd'
  const stripe_price_id =
    options.stripe_price_id ?? `price_test_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const provider_environment = options.provider_environment ?? 'production'
  const provider_application_id = options.provider_application_id ?? `test-${randomUUID()}`
  const product = await createOrGetActiveMembershipProduct(plan, interval, options.id)
  const { rows: providerProductRows } = await write(sql`/* createTestSku: Stripe product */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units, currency_code
    ) VALUES (${product.id}, 'stripe', ${provider_environment}, ${provider_application_id}, ${stripe_price_id}, ${price_minor_units}, ${currency_code})
    ON CONFLICT (provider, environment, application_id, provider_product_id, base_plan_id, offer_id, sku_id)
    DO UPDATE SET price_minor_units = EXCLUDED.price_minor_units, currency_code = EXCLUDED.currency_code, retired_at = NULL
    RETURNING id
  `)
  const providerProduct = providerProductRows[0] as { id: string }
  return {
    ...product,
    price_minor_units: String(price_minor_units),
    currency_code,
    stripe_price_id,
    membership_provider_product_id: providerProduct.id,
    provider: 'stripe' as const,
    provider_environment,
    provider_application_id,
  }
}

export async function retireTestMembershipProviderProduct(
  membershipProviderProductId: string,
): Promise<void> {
  await write(sql`/* retireTestMembershipProviderProduct */
    UPDATE membership_provider_products
    SET retired_at = CURRENT_TIMESTAMP
    WHERE id = ${membershipProviderProductId} AND retired_at IS NULL`)
}

export async function createTestNativeMembershipProviderProduct(options: {
  membershipProductId: string
  provider: 'apple_app_store' | 'google_play' | 'microsoft_store'
  environment: 'test' | 'production'
  applicationId: string
  providerProductId: string
  basePlanId?: string
  offerId?: string
  skuId?: string
}): Promise<{ id: string }> {
  const { rows } = await write<{ id: string }>(sql`/* createTestNativeMembershipProviderProduct */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id,
      base_plan_id, offer_id, sku_id
    ) VALUES (
      ${options.membershipProductId}, ${options.provider}, ${options.environment},
      ${options.applicationId}, ${options.providerProductId}, ${options.basePlanId ?? null},
      ${options.offerId ?? null}, ${options.skuId ?? null}
    )
    RETURNING id`)
  const row = rows[0]
  if (!row) throw new Error('Native membership provider product was not returned')
  return row
}

export async function createRetiredTestSkuRecord(options: CreateTestSkuOptions = {}) {
  const plan = options.plan ?? 'plus'
  const priceMinorUnits = options.price_minor_units ?? 500
  const interval = options.interval ?? 'monthly'
  const currencyCode = options.currency_code ?? 'usd'
  const stripePriceId =
    options.stripe_price_id ??
    `price_retired_test_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const providerEnvironment = options.provider_environment ?? 'production'
  const providerApplicationId = options.provider_application_id ?? `test-${randomUUID()}`
  const { rows: productRows } = await write(sql`/* createRetiredTestSku: canonical product */
    INSERT INTO membership_products (id, plan, billing_interval, retired_at)
    VALUES (COALESCE(${options.id ?? null}::uuid, uuidv7()), ${plan}, ${interval}, CURRENT_TIMESTAMP)
    RETURNING id, plan, billing_interval AS interval, created_at, updated_at`)
  const product = productRows[0] as TestMembershipProduct
  const { rows: providerProductRows } = await write(sql`/* createRetiredTestSku: provider product */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id,
      provider_product_id, price_minor_units, currency_code, retired_at
    ) VALUES (
      ${product.id}, 'stripe', ${providerEnvironment}, ${providerApplicationId},
      ${stripePriceId}, ${priceMinorUnits}, ${currencyCode}, CURRENT_TIMESTAMP
    )
    RETURNING id`)
  return {
    ...product,
    price_minor_units: String(priceMinorUnits),
    currency_code: currencyCode,
    stripe_price_id: stripePriceId,
    membership_provider_product_id: (providerProductRows[0] as { id: string }).id,
    provider: 'stripe' as const,
    provider_environment: providerEnvironment,
    provider_application_id: providerApplicationId,
  }
}

async function createOrGetActiveMembershipProduct(
  plan: MembershipPlanSlug,
  interval: MembershipBillingInterval,
  id: string | undefined,
): Promise<TestMembershipProduct> {
  if (id === undefined) {
    await write(sql`/* createTestSku: active product */
      INSERT INTO membership_products (plan, billing_interval)
      VALUES (${plan}, ${interval})
      ON CONFLICT (plan, billing_interval) WHERE retired_at IS NULL DO NOTHING`)
  } else {
    await write(sql`/* createTestSku: explicit product */
      INSERT INTO membership_products (id, plan, billing_interval)
      VALUES (${id}, ${plan}, ${interval})
      ON CONFLICT (plan, billing_interval) WHERE retired_at IS NULL DO NOTHING`)
  }
  const { rows } = await write(sql`/* createTestSku: find active product */
    SELECT id, plan, billing_interval AS interval, created_at, updated_at
    FROM membership_products
    WHERE plan = ${plan} AND billing_interval = ${interval} AND retired_at IS NULL`)
  return rows[0] as TestMembershipProduct
}
