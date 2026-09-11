import { write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type Stripe from 'stripe'
import { hydrateStripeEventRecord } from './event-record.mts'
import type { InsertStripeEventResult, StripeEventRow } from './events-types.mts'
import { normalizeStripeEvent } from './normalize-event.mts'

function stripeEventColumns() {
  return sql`
    id,
    stripe_event_id,
    event_type,
    livemode,
    api_version,
    stripe_created_at,
    customer_id,
    subscription_id,
    invoice_id,
    checkout_session_id,
    received_at,
    processing_attempt_id,
    dispatched_at,
    processing_started_at,
    processing_attempts,
    processed_at,
    ignored_at,
    failed_at,
    last_error_at,
    last_error_message,
    payload,
    created_at
  `
}

export async function insertStripeEvent(event: Stripe.Event): Promise<InsertStripeEventResult> {
  const normalized = normalizeStripeEvent(event)
  const payload = JSON.stringify(event)

  const inserted = await write(
    sql`/* insertStripeEvent */
      INSERT INTO stripe_events (
        stripe_event_id,
        event_type,
        livemode,
        api_version,
        stripe_created_at,
        customer_id,
        subscription_id,
        invoice_id,
        checkout_session_id,
        payload
      ) VALUES (
        ${event.id},
        ${event.type},
        ${event.livemode},
        ${event.api_version ?? null},
        ${normalized.stripeCreatedAt},
        ${normalized.customerId},
        ${normalized.subscriptionId},
        ${normalized.invoiceId},
        ${normalized.checkoutSessionId},
        ${payload}::jsonb
      )
      ON CONFLICT (stripe_event_id) DO NOTHING
      RETURNING
    `.append(stripeEventColumns()),
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
      FROM stripe_events
      WHERE stripe_event_id = ${event.id}
    `),
  )
  assert(existing.rows.length === 1, 500, `stripe_events row missing after conflict: ${event.id}`)
  return hydrateStripeEventRecord({
    ...(existing.rows[0] as StripeEventRow),
    is_new: false,
  })
}
