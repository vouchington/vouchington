import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type Stripe from 'stripe'
import { hydrateStripeEventRecord } from './event-record.mts'
import type { InsertStripeEventResult, StripeEventRow } from './events-types.mts'
import { stripeEventColumns } from './event-columns.mts'
import { normalizeStripeEvent } from '@vouchington/stripe'

export async function insertStripeEvent(
  event: Stripe.Event,
  receivedAt = new Date(),
): Promise<InsertStripeEventResult> {
  const normalized = normalizeStripeEvent(event)
  const payload = JSON.stringify(event)
  await using query = await beginTransaction()

  // Retention takes FOR UPDATE on an expired row. Hold a conflicting key-share lock
  // through the replay read so the row cannot disappear before we return it.
  const existing = await findStripeEventForReplay(event.id, query)
  if (existing) {
    await query.commit()
    return hydrateStripeEventRecord({ ...existing, is_new: false })
  }

  const inserted = await query(
    sql`/* insertStripeEvent */
      WITH registered_type AS (
        INSERT INTO stripe_event_types (stripe_event_type) VALUES (${event.type})
        ON CONFLICT (stripe_event_type) DO UPDATE SET stripe_event_type = EXCLUDED.stripe_event_type
        RETURNING id, stripe_event_type
      )
       , inserted_event AS (INSERT INTO stripe_events (
        stripe_event_id,
        stripe_event_type_id,
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
      WHERE TRUE
      ON CONFLICT (stripe_event_id) DO NOTHING
      RETURNING id, stripe_event_id, stripe_event_type_id, is_live_mode, api_version, occurred_at,
        customer_id, subscription_id, invoice_id, checkout_session_id, received_at, payload, created_at
      ), inserted_work AS (
        INSERT INTO stripe_event_processing_work_items (stripe_event_id)
        SELECT id FROM inserted_event
        RETURNING stripe_event_id, lease_token, dispatched_at, leased_at, lease_expires_at,
          attempt_count, available_at, processed_at, ignored_at, failed_at, last_error_at, last_error_message
      ) SELECT
    `.append(stripeEventColumns()).append(sql`
      FROM inserted_event event
      JOIN inserted_work work ON work.stripe_event_id = event.id
      JOIN registered_type event_type ON event_type.id = event.stripe_event_type_id
    `),
  )

  if (inserted.rows.length > 0) {
    await query.commit()
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
  // A concurrent insert can win after the first read. Its insert and work row
  // commit together; this fresh statement locks the winner for the replay.
  const raced = await findStripeEventForReplay(event.id, query)
  assert(raced, 500, `stripe_events row missing after conflict: ${event.id}`)
  await query.commit()
  return hydrateStripeEventRecord({ ...raced, is_new: false })
}

async function findStripeEventForReplay(
  stripeEventId: string,
  query: TransactionQuery,
): Promise<StripeEventRow | null> {
  const existing = await query(
    sql`/* findStripeEventForReplay */
      SELECT
    `.append(stripeEventColumns()).append(sql`
      FROM stripe_events event
      LEFT JOIN stripe_event_processing_work_items work ON work.stripe_event_id = event.id
      JOIN stripe_event_types event_type ON event_type.id = event.stripe_event_type_id
      WHERE event.stripe_event_id = ${stripeEventId}
      FOR KEY SHARE OF event
    `),
  )
  return (existing.rows[0] as StripeEventRow | undefined) ?? null
}
