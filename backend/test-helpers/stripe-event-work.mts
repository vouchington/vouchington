import { randomUUID } from 'node:crypto'
import type { insertStripeEvent } from '../services/stripe/insert-event.mts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { markStripeEventCompleted } from '../services/stripe/event-lifecycle.mts'

export function createTestStripeDeletionEvent(): Parameters<typeof insertStripeEvent>[0] {
  return {
    id: `evt_${randomUUID()}`,
    object: 'event',
    api_version: 'synthetic',
    created: 1_741_398_400,
    data: {
      object: {
        id: `cus_${randomUUID()}`,
        object: 'customer',
        balance: 0,
        created: 1_741_398_400,
        default_source: null,
        description: null,
        email: null,
        invoice_settings: {
          custom_fields: null,
          default_payment_method: null,
          footer: null,
          rendering_options: null,
        },
        livemode: false,
        metadata: {},
        shipping: null,
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: 'customer.deleted',
  }
}

export async function rewriteTestImmutableStripeEvent(id: string): Promise<void> {
  await write(sql`/* rewriteTestImmutableStripeEvent */
    UPDATE stripe_events SET occurred_at = clock_timestamp() WHERE id = ${id}
  `)
}

export async function markTestStripeEventIgnored(id: string): Promise<void> {
  const { rows } = await write<{
    lease_token: string
  }>(sql`/* claimTestStripeEventForTerminalOutcome */
    UPDATE stripe_event_processing_work_items
    SET leased_at = clock_timestamp(), lease_expires_at = clock_timestamp() + INTERVAL '1 hour'
    WHERE stripe_event_id = ${id}
    RETURNING lease_token`)
  await markStripeEventCompleted(id, 'ignored', rows[0]!.lease_token)
}

export async function stripeEventIdentityState(providerEventId: string): Promise<{
  live: boolean
  retained: boolean
}> {
  const { rows } = await write<{ live: boolean; retained: boolean }>(sql`
    /* stripeEventIdentityState */ SELECT
      EXISTS (SELECT 1 FROM stripe_events WHERE stripe_event_id = ${providerEventId}) AS live,
      EXISTS (SELECT 1 FROM stripe_event_retained_identities
              WHERE stripe_event_id = ${providerEventId}) AS retained`)
  return rows[0]!
}

export async function deleteTestStripeEventWithoutRetention(id: string): Promise<void> {
  await write(sql`/* deleteTestStripeEventWithoutRetention */
    DELETE FROM stripe_events WHERE id = ${id}`)
}

export async function expireTerminalStripeWorkBeforeLedger(id: string): Promise<void> {
  await write(sql`/* expireTerminalStripeWorkBeforeLedger */
    DELETE FROM stripe_event_processing_work_items WHERE stripe_event_id = ${id}`)
}

export async function attemptYoungStripeLedgerDeletion(id: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* enableYoungStripeRetentionProbe */
    SET LOCAL app.billing_retention_delete = 'on'`)
  await query(sql`/* rejectYoungStripeLedgerDeletion */
    DELETE FROM stripe_events WHERE id = ${id}`)
}
