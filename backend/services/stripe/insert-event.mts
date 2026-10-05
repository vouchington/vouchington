import { write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type Stripe from 'stripe'
import { hydrateStripeEventRecord } from './event-record.mts'
import type { InsertStripeEventResult, StripeEventRow } from './events-types.mts'
import { stripeEventColumns } from './event-columns.mts'
import { normalizeStripeEvent } from './normalize-event.mts'

export async function insertStripeEvent(
  event: Stripe.Event,
  receivedAt = new Date(),
): Promise<InsertStripeEventResult> {
  const normalized = normalizeStripeEvent(event)
  const payload = JSON.stringify(event)

  const inserted = await write(
    sql`/* insertStripeEvent */
      WITH registered_type AS (
        INSERT INTO stripe_event_types (id) VALUES (${event.type})
        ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
        RETURNING id
      )
       , inserted_event AS (INSERT INTO stripe_events (
        stripe_event_id,
        event_type,
        is_live_mode,
        api_version,
        occurred_at,
        customer_id,
        subscription_id,
        invoice_id,
        checkout_session_id,
        received_at,
        payload
      ) SELECT
        ${event.id},
        registered_type.id,
        ${event.livemode},
        ${event.api_version ?? null},
        ${normalized.stripeCreatedAt},
        ${normalized.customerId},
        ${normalized.subscriptionId},
        ${normalized.invoiceId},
        ${normalized.checkoutSessionId},
        ${receivedAt},
        ${payload}::jsonb
      FROM registered_type
      ON CONFLICT (stripe_event_id) DO NOTHING
      RETURNING id, stripe_event_id, event_type, is_live_mode, api_version, occurred_at,
        customer_id, subscription_id, invoice_id, checkout_session_id, received_at, payload, created_at
      ), inserted_work AS (
        INSERT INTO stripe_event_processing_work_items (stripe_event_id)
        SELECT id FROM inserted_event
        RETURNING stripe_event_id, lease_token, dispatched_at, leased_at, lease_expires_at,
          attempt_count, available_at, processed_at, ignored_at, failed_at, last_error_at, last_error_message
      ) SELECT
    `.append(stripeEventColumns()).append(sql`
      FROM inserted_event event JOIN inserted_work work ON work.stripe_event_id = event.id
    `),
  )

  if (inserted.rows.length > 0) {
    return hydrateStripeEventRecord({
      ...(inserted.rows[0] as StripeEventRow),
      is_new: true,
    })
  }

  // ON CONFLICT DO NOTHING only fires when another transaction already committed this
  // stripe_event_id, but READ COMMITTED fixes each statement's snapshot at that statement's
  // start -- a fallback SELECT folded into the same statement as the INSERT (e.g. a CTE) can
  // still miss the winner's just-committed row and return zero rows. Running the fallback as
  // its own statement gives it a fresh snapshot that is guaranteed to see the committed winner.
  const existing = await write(
    sql`/* insertStripeEvent (conflict fallback) */
      SELECT
    `.append(stripeEventColumns()).append(sql`
      FROM stripe_events event
      JOIN stripe_event_processing_work_items work ON work.stripe_event_id = event.id
      WHERE event.stripe_event_id = ${event.id}
    `),
  )
  assert(existing.rows.length === 1, 500, `stripe_events row missing after conflict: ${event.id}`)
  return hydrateStripeEventRecord({
    ...(existing.rows[0] as StripeEventRow),
    is_new: false,
  })
}
