import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONFLICT, INVALID_INPUT, SERVICE_UNAVAILABLE } from '@modules/on-error/error-codes'
import { createMembershipCheckoutSessionOperation } from '@modules/stripe/operations'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'
import sql from 'sql-template-strings'
import { getDirectMembershipSourceAdmission } from './direct-source-authority.mts'
import {
  assertMatchingPurchaseIntent,
  createMembershipPurchaseIntentFingerprint,
  toPurchaseIntent,
  type MembershipPurchaseIntent,
  type MembershipPurchaseProvider,
  type PurchaseIntentRow,
} from './purchase-intent-launches.mts'
import { insertPurchaseIntent } from './insert-purchase-intent.mts'
import { isMembershipPurchaseEnabled } from './purchase-controls.mts'
export * from './purchase-intent-launches.mts'

export class MembershipPurchaseIneligibleError extends Error {
  readonly status = 409
  readonly code = CONFLICT
  readonly provider: MembershipPurchaseProvider | null
  readonly eligibleAt: Date | null

  constructor(provider: MembershipPurchaseProvider | null, eligibleAt: Date | null) {
    super('Membership purchase is not eligible.')
    this.name = 'MembershipPurchaseIneligibleError'
    this.provider = provider
    this.eligibleAt = eligibleAt
  }
}

export async function expireStripeMembershipPurchaseIntentForCheckout(options: {
  checkoutId: string
  environment: 'test' | 'production'
  applicationId: string
}): Promise<void> {
  await write(sql`/* expireStripeMembershipPurchaseIntentForCheckout */
    UPDATE membership_purchase_intents intent
    SET expired_at = CURRENT_TIMESTAMP
    FROM membership_provider_contexts context
    WHERE intent.provider_checkout_id = ${options.checkoutId}
      AND intent.membership_provider_context_id = context.id
      AND context.provider = 'stripe'
      AND context.environment = ${options.environment}
      AND context.application_id = ${options.applicationId}
      AND intent.launched_at IS NOT NULL
      AND intent.failed_at IS NULL
      AND intent.expired_at IS NULL
  `)
}

export async function getStripePurchaseIntentOwner(options: {
  purchaseIntentId: string
  environment: 'test' | 'production'
  providerProductId: string
}): Promise<string | null> {
  const { rows } = await write<{ user_id: string }>(sql`/* getStripePurchaseIntentOwner */
    SELECT intent.user_id
    FROM membership_purchase_intents intent
    INNER JOIN membership_provider_products mapping
      ON mapping.id = intent.membership_provider_product_id
    INNER JOIN membership_provider_contexts context
      ON context.id = intent.membership_provider_context_id
    WHERE intent.id = ${options.purchaseIntentId}
      AND intent.user_id IS NOT NULL
      AND context.provider = 'stripe'
      AND context.environment = ${options.environment}
      AND mapping.provider_product_id = ${options.providerProductId}
      AND intent.launched_at IS NOT NULL
      AND intent.failed_at IS NULL
      AND intent.expired_at IS NULL
    LIMIT 1`)
  return rows[0]?.user_id ?? null
}

export async function createMembershipPurchaseIntent(options: {
  userId: string
  email?: string
  provider: MembershipPurchaseProvider
  productId: string
  idempotencyKey: string
}): Promise<MembershipPurchaseIntent> {
  const fingerprint = createMembershipPurchaseIntentFingerprint(options.provider, options.productId)
  const existing = await getPurchaseIntent(options.userId, options.idempotencyKey)
  if (existing) {
    assertMatchingPurchaseIntent(existing, fingerprint)
    if (existing.launched_at !== null) return toPurchaseIntent(existing, true)
  } else if (!isMembershipPurchaseEnabled(options.provider))
    throw createCodedError(
      503,
      'New purchases for this provider are disabled.',
      SERVICE_UNAVAILABLE,
    )

  const providerContext = getMembershipProviderContext(options.provider)
  await using query = await beginTransaction()
  await query(sql`/* createMembershipPurchaseIntent.lockUser */
    SELECT id FROM users WHERE id = ${options.userId} FOR UPDATE`)
  const lockedExisting = await getPurchaseIntent(options.userId, options.idempotencyKey, query)
  if (!lockedExisting) {
    const conflictingIntent = await getConflictingPurchaseIntent(options.userId, query)
    if (conflictingIntent)
      throw new MembershipPurchaseIneligibleError(null, conflictingIntent.expires_at)
  }
  const insertedRow = await insertPurchaseIntent(query, options, providerContext, fingerprint)
  const inserted = insertedRow !== undefined
  const row =
    insertedRow ?? (await getPurchaseIntent(options.userId, options.idempotencyKey, query))
  if (!row)
    throw createCodedError(
      400,
      'No active provider mapping exists for this product.',
      INVALID_INPUT,
    )
  assertMatchingPurchaseIntent(row, fingerprint)

  const admission = await getDirectMembershipSourceAdmission(
    options.userId,
    row.plan,
    options.provider === 'apple_app_store' || options.provider === 'google_play'
      ? { transitionProvider: options.provider }
      : undefined,
    query,
  )
  if (!admission.accepted) {
    throw new MembershipPurchaseIneligibleError(admission.currentProvider, admission.eligibleAt)
  }
  await query.commit()

  if (row.launched_at !== null) return toPurchaseIntent(row, true)
  if (row.provider === 'stripe') {
    const checkout = await createMembershipCheckoutSessionOperation({
      userId: options.userId,
      ...(options.email ? { email: options.email } : {}),
      priceId: row.provider_product_id,
      purchaseIntentId: row.id,
      successUrl: `${SITEMAP_CONFIG.BASE_URL}/my/membership?checkout=success`,
      cancelUrl: `${SITEMAP_CONFIG.BASE_URL}/plans`,
      customerIdempotencyKey: `membership-intent:${row.id}:customer`,
      checkoutIdempotencyKey: `membership-intent:${row.id}:checkout`,
    })
    if (!checkout.url) throw new Error('Stripe did not return a Checkout URL')
    await write(sql`/* createMembershipPurchaseIntent.launchStripe */
      UPDATE membership_purchase_intents
      SET provider_checkout_id = ${checkout.id}, provider_checkout_url = ${checkout.url},
        launched_at = CURRENT_TIMESTAMP
      WHERE id = ${row.id} AND launched_at IS NULL AND failed_at IS NULL`)
  } else {
    await write(sql`/* createMembershipPurchaseIntent.launchNative */
      UPDATE membership_purchase_intents SET launched_at = CURRENT_TIMESTAMP
      WHERE id = ${row.id} AND launched_at IS NULL AND failed_at IS NULL`)
  }
  const launched = await getPurchaseIntent(options.userId, options.idempotencyKey)
  if (!launched?.launched_at) throw new Error('Membership purchase intent was not launched')
  return toPurchaseIntent(launched, !inserted)
}

async function getPurchaseIntent(
  userId: string,
  idempotencyKey: string,
  query: QueryExecutor = write,
) {
  const { rows } = await query<PurchaseIntentRow>(sql`/* getMembershipPurchaseIntent */
    SELECT intent.id, intent.user_id, intent.request_fingerprint, intent.membership_product_id,
      context.provider, context.environment, context.application_id, intent.provider_checkout_url,
      intent.launched_at, intent.failed_at, intent.failure_code, intent.expires_at,
      mapping.provider_product_id, mapping.base_plan_id, mapping.offer_id,
      mapping.sku_id, product.plan
    FROM membership_purchase_intents intent
    INNER JOIN membership_provider_products mapping ON mapping.id = intent.membership_provider_product_id
    INNER JOIN membership_provider_contexts context ON context.id = intent.membership_provider_context_id
    INNER JOIN membership_products product ON product.id = intent.membership_product_id
    WHERE intent.user_id = ${userId} AND intent.idempotency_key = ${idempotencyKey}
    LIMIT 1`)
  return rows[0] ?? null
}
async function getConflictingPurchaseIntent(userId: string, query: QueryExecutor) {
  const { rows } = await query<{ expires_at: Date }>(sql`/* getConflictingPurchaseIntent */
    SELECT expires_at FROM membership_purchase_intents
    WHERE user_id = ${userId} AND failed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    ORDER BY expires_at DESC, id DESC
    LIMIT 1`)
  return rows[0] ?? null
}
