import { createHash, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { GooglePlaySubscriptionsV2Client } from '../services/memberships/google/types.mts'

export async function getTestPendingGooglePlayVerification(options: {
  userId: string
  applicationId: string
}): Promise<string | null> {
  const { rows } = await write<{ id: string }>(sql`
    /* getTestPendingGooglePlayVerification */
    SELECT verification.id
    FROM membership_verifications verification
    INNER JOIN membership_provider_contexts context
      ON context.id = verification.membership_provider_context_id
    WHERE verification.user_id = ${options.userId}
      AND context.provider = 'google_play'
      AND context.application_id = ${options.applicationId}
      AND verification.verified_at IS NULL
      AND verification.conflicted_at IS NULL
      AND verification.rejected_at IS NULL
    ORDER BY verification.id DESC
    LIMIT 1
  `)
  return rows[0]?.id ?? null
}

export function createTestGooglePlayRtdnBody(
  applicationId: string,
  notification: Record<string, unknown>,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      message: {
        messageId: `test-rtdn-${randomUUID()}`,
        data: Buffer.from(
          JSON.stringify({
            packageName: applicationId,
            eventTimeMillis: String(Date.now()),
            ...notification,
          }),
        ).toString('base64'),
      },
    }),
  )
}

export function createTestGooglePlayClient(options: {
  productId: string
  userId: string
  pending?: boolean
}): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async () => ({
      latestOrderId: `synthetic-order-${randomUUID()}`,
      subscriptionState: options.pending
        ? 'SUBSCRIPTION_STATE_PENDING'
        : 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      testPurchase: {},
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: createHash('sha256').update(options.userId).digest('hex'),
      },
      lineItems: [
        {
          productId: options.productId,
          expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        },
      ],
    }),
    acknowledgeSubscription: async () => undefined,
  }
}
