import { createHash, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createTestLaunchedNativeMembershipPurchaseIntent(options: {
  membershipProviderProductId: string
  userId: string
}): Promise<string> {
  const { rows } = await write<{
    id: string
  }>(sql`/* createTestLaunchedNativeMembershipPurchaseIntent */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id,
      membership_product_id, provider, environment, application_id, launched_at
    ) SELECT
      ${options.userId}, ${randomUUID()}, ${createHash('sha256').update(randomUUID()).digest('hex')}, mapping.id,
      mapping.membership_product_id, mapping.provider, mapping.environment, mapping.application_id,
      CURRENT_TIMESTAMP
    FROM membership_provider_products mapping
    WHERE mapping.id = ${options.membershipProviderProductId}
      AND mapping.provider IN ('apple_app_store', 'google_play', 'microsoft_store')
    RETURNING id`)
  const row = rows[0]
  if (!row) throw new Error('Native membership purchase intent was not returned')
  return row.id
}
