import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'

export type MembershipPurchaseIntentFixture = {
  applicationId: string
  mappingId: string
  productId: string
  requestFingerprint: string
  userId: string
}

type WriteResult = { rowCount: number | null }

export async function createPriceOptionalProviderProduct(suffix: string): Promise<WriteResult> {
  const productId = await getPlusMonthlyProductId()
  return write(sql`/* createPriceOptionalProviderProduct */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id
    ) VALUES (
      ${productId}, 'apple_app_store', 'test', ${`price-optional-${suffix}`}, ${`product-${suffix}`}
    )`)
}

export async function createPartialPriceProviderProduct(suffix: string): Promise<WriteResult> {
  const productId = await getPlusMonthlyProductId()
  return write(sql`/* rejectPartialProviderProductPrice */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units
    ) VALUES (
      ${productId}, 'google_play', 'test', ${`partial-price-${suffix}`}, ${`product-${suffix}`}, 100
    )`)
}

export async function createMembershipPurchaseIntentFixture(
  prefix: string,
  fixtureUserId?: string,
): Promise<MembershipPurchaseIntentFixture> {
  const suffix = randomUUID()
  const applicationId = `schema-${prefix}-${suffix}`
  const { rows: userRows } = await read<{ id: string }>(sql`/* getMembershipSchemaFixtureUser */
    SELECT id FROM users ORDER BY id LIMIT 1`)
  const productId = await getPlusMonthlyProductId()
  const { rows: mappingRows } = await write<{
    id: string
  }>(sql`/* createMembershipSchemaFixtureMapping */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units, currency_code
    ) VALUES (${productId}, 'stripe', 'test', ${applicationId}, ${`price-${suffix}`}, 100, 'usd') RETURNING id`)
  return {
    applicationId,
    mappingId: mappingRows[0]!.id,
    productId,
    requestFingerprint: suffix.replaceAll('-', '').padEnd(64, 'a'),
    userId: fixtureUserId ?? userRows[0]!.id,
  }
}

export async function createMembershipPurchaseIntent(
  fixture: MembershipPurchaseIntentFixture,
  idempotencyKey: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipPurchaseIntent */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id, membership_product_id,
      provider, environment, application_id, provider_checkout_id, provider_checkout_url, launched_at
    ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint}, ${fixture.mappingId}, ${fixture.productId},
      'stripe', 'test', ${fixture.applicationId}, ${`checkout-${randomUUID()}`}, 'https://checkout.stripe.com/test', CURRENT_TIMESTAMP)
    RETURNING id`)
  return rows[0]!.id
}

export function createPartialPurchaseIntentCheckout(
  fixture: MembershipPurchaseIntentFixture,
): Promise<WriteResult> {
  return write(sql`/* rejectPartialMembershipPurchaseIntentCheckout */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id, membership_product_id,
      provider, environment, application_id, provider_checkout_id
    ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint}, ${fixture.mappingId}, ${fixture.productId},
      'stripe', 'test', ${fixture.applicationId}, ${`checkout-${randomUUID()}`})`)
}

export function createFailedPurchaseIntentWithoutCode(
  fixture: MembershipPurchaseIntentFixture,
): Promise<WriteResult> {
  return write(sql`/* rejectMembershipPurchaseIntentFailedWithoutCode */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id, membership_product_id,
      provider, environment, application_id, failed_at
    ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint}, ${fixture.mappingId}, ${fixture.productId},
      'stripe', 'test', ${fixture.applicationId}, CURRENT_TIMESTAMP)`)
}

export function createExpiredPurchaseIntent(
  fixture: MembershipPurchaseIntentFixture,
): Promise<WriteResult> {
  return write(sql`/* rejectExpiredMembershipPurchaseIntentWindow */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id, membership_product_id,
      provider, environment, application_id, expires_at
    ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint}, ${fixture.mappingId}, ${fixture.productId},
      'stripe', 'test', ${fixture.applicationId}, '2000-01-01T00:00:00.000Z')`)
}

async function getPlusMonthlyProductId(): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* getMembershipSchemaFixtureProduct */
    SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
  return rows[0]!.id
}
