import { randomUUID } from 'node:crypto'
import type { insertStripeEvent } from '../services/stripe/insert-event.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

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
