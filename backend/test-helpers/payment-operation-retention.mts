import { randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import type Stripe from 'stripe'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipPurchaseIntentFixture } from './data-stores/psql/membership-purchase-intents.mts'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'

export function acquirePaymentOperationRetentionTestLock() {
  return acquireTestPostgresAdvisoryLock({
    namespace: 1_447_904_068,
    key: 3548,
    timeout: '25s',
  })
}

export async function seedStripeEventRetentionWork(
  event: Stripe.Event,
  createdAt: Date,
  processedAt: Date | null,
): Promise<string> {
  const id = v7({ msecs: createdAt.getTime() })
  await write(sql`/* seedStripeEventRetentionWork */
    WITH event_type AS (
      INSERT INTO stripe_event_types (stripe_event_type) VALUES (${event.type})
      ON CONFLICT (stripe_event_type) DO UPDATE SET stripe_event_type = EXCLUDED.stripe_event_type
      RETURNING id
    ), inserted_event AS (
      INSERT INTO stripe_events (id, stripe_event_id, stripe_event_type_id, occurred_at, payload)
      SELECT ${id}, ${event.id}, event_type.id, ${createdAt}, ${JSON.stringify(event)}::jsonb
      FROM event_type RETURNING id
    )
    INSERT INTO stripe_event_processing_work_items (stripe_event_id, processed_at)
    SELECT id, ${processedAt} FROM inserted_event
  `)
  return id
}

export async function stripeEventWorkExists(id: string): Promise<boolean> {
  const { rows } = await read(sql`/* stripeEventWorkExists */
    SELECT stripe_event_id FROM stripe_event_processing_work_items WHERE stripe_event_id = ${id}
  `)
  return rows.length > 0
}

export async function seedMembershipPurchaseIntentForRetention(
  fixture: MembershipPurchaseIntentFixture,
  createdAt: Date,
  expiresAt: Date,
  state: 'unlaunched' | 'failed' | 'launched',
): Promise<string> {
  const id = v7({ msecs: createdAt.getTime() })
  await write(sql`/* seedMembershipPurchaseIntentForRetention */
    INSERT INTO membership_purchase_intents (
      id, user_id, idempotency_key, request_fingerprint, membership_provider_product_id,
      membership_product_id, membership_provider_context_id, expires_at, launched_at,
      failed_at, failure_code
    ) VALUES (
      ${id}, ${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint}, ${fixture.mappingId},
      ${fixture.productId}, fn_upsert_membership_provider_context_id('stripe', 'test', ${fixture.applicationId}),
      ${expiresAt}, ${state === 'launched' ? createdAt : null},
      ${state === 'failed' ? createdAt : null}, ${state === 'failed' ? 'test_failure' : null}
    )
  `)
  return id
}

export async function membershipPurchaseIntentExists(id: string): Promise<boolean> {
  const { rows } = await read(sql`/* membershipPurchaseIntentExists */
    SELECT id FROM membership_purchase_intents WHERE id = ${id}
  `)
  return rows.length > 0
}
