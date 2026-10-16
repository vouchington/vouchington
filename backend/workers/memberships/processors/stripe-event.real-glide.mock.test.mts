import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import type { ProcessStripeEventData } from '@queues/memberships/types'
import { getStripeEventById, ingestStripeEvent } from '@services/stripe/events'
import { claimRecoverableStripeEvents } from '@services/stripe/recovery'
import { makeStripeEventRecoverableForTest } from '@voucha/test-helpers'
import { processStripeEvent, recoverStripeEvents } from './stripe-event.mts'

// The dedicated backend-real-glide-mq project routes only .real-glide.mock.test.mts files, and
// retained-record behavior is a property of the real GlideMQ transport, not the in-memory shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

type StripeEvent = Parameters<typeof ingestStripeEvent>[0]

describe('Stripe event recovery with a retained failed job under the lease token', () => {
  it('re-dispatches the unleased event so its job acquires the lease', async () => {
    const stored = await ingestStripeEvent(makeEvent(`sub_${randomUUID()}`))
    const jobId = `stripe-event__${stored.id}__${stored.lease_token}`

    try {
      // A job that stalls past its limit, or fails before it leases the event, leaves exactly this.
      await expect(memberships.revoke(jobId)).resolves.toBe('revoked')
      await expect((await memberships.getJob(jobId))?.getState()).resolves.toBe('failed')
      await makeStripeEventRecoverableForTest(stored.id, 'unstarted')

      await recoverStripeEvents({
        claimRecoverableStripeEvents: () => claimRecoverableStripeEvents([stored.id]),
      })

      const redispatched = await memberships.getJob(jobId)
      if (!redispatched) throw new Error('Expected recovery to dispatch the event again')
      await expect(redispatched.getState()).resolves.not.toMatch(/^(completed|failed)$/)
      expect(redispatched.data).toMatchObject({
        stripeEventRecordId: stored.id,
        leaseToken: stored.lease_token,
      })

      await processStripeEvent(redispatched.data as ProcessStripeEventData)

      expect((await getStripeEventById(stored.id))?.status).toBe('ignored')
    } finally {
      await (await memberships.getJob(jobId))?.remove()
    }
  })
})

/** An event type the processor ignores, with a subscription so the job carries its ordering key. */
function makeEvent(subscriptionId: string): StripeEvent {
  const suffix = randomUUID()
  return {
    id: `evt_recovery_${suffix}`,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `in_${suffix}`, object: 'invoice', subscription: subscriptionId } },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'invoice.upcoming',
  } as unknown as StripeEvent
}
