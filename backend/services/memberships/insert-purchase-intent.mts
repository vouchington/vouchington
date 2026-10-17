import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipPurchaseProvider, PurchaseIntentRow } from './purchase-intent-launches.mts'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'

export async function insertPurchaseIntent(
  query: QueryExecutor,
  options: {
    userId: string
    provider: MembershipPurchaseProvider
    productId: string
    idempotencyKey: string
  },
  providerContext: ReturnType<typeof getMembershipProviderContext>,
  fingerprint: string,
): Promise<PurchaseIntentRow | undefined> {
  const { rows } = await query<PurchaseIntentRow>(sql`/* createMembershipPurchaseIntent.insert */
    WITH inserted AS (
      INSERT INTO membership_purchase_intents (
        user_id, idempotency_key, request_fingerprint, membership_provider_product_id,
        membership_product_id, membership_provider_context_id
      )
      SELECT ${options.userId}::UUID AS user_id, ${options.idempotencyKey}::UUID AS idempotency_key,
        ${fingerprint}, mapping.id,
        product.id, mapping.membership_provider_context_id
      FROM membership_products product
      INNER JOIN membership_provider_products mapping ON mapping.membership_product_id = product.id
      INNER JOIN membership_provider_contexts context
        ON context.id = mapping.membership_provider_context_id
      WHERE product.id = ${options.productId}
        AND product.retired_at IS NULL
        AND context.provider = ${options.provider}
        AND context.environment = ${providerContext.environment}
        AND context.application_id = ${providerContext.applicationId}
        AND mapping.retired_at IS NULL
      ORDER BY user_id ASC NULLS LAST, idempotency_key ASC NULLS LAST, mapping.id DESC
      LIMIT 1
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING id, user_id, request_fingerprint, membership_product_id,
        membership_provider_product_id, membership_provider_context_id, provider_checkout_url,
        launched_at, failed_at, failure_code, expires_at
    )
    SELECT inserted.id, inserted.user_id, inserted.request_fingerprint,
      inserted.membership_product_id,
      context.provider, context.environment, context.application_id, inserted.provider_checkout_url,
      inserted.launched_at, inserted.failed_at, inserted.failure_code, inserted.expires_at,
      mapping.provider_product_id, mapping.base_plan_id, mapping.offer_id,
      mapping.sku_id, product.plan
    FROM inserted
    INNER JOIN membership_provider_products mapping ON mapping.id = inserted.membership_provider_product_id
    INNER JOIN membership_provider_contexts context ON context.id = inserted.membership_provider_context_id
    INNER JOIN membership_products product ON product.id = inserted.membership_product_id
  `)
  return rows[0]
}
