import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import type { ProcessStripeEventData } from '@queues/memberships/types'
import { getStripeEventById, ingestStripeEvent } from '@services/stripe/events'
import { makeStripeEventRecoverableForTest } from '@voucha/test-helpers'
import {
  createRecoverableStripeEvent,
  createStripeRecoveryEvent,
} from '@voucha/test-helpers/stripe-recovery-fixtures'
import { processStripeEvent, recoverStripeEvents } from './stripe-event.mts'

// The dedicated backend-real-glide-mq project routes only .real-glide.mock.test.mts files, and
// retained-record behavior is a property of the real GlideMQ transport, not the in-memory shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('Stripe event recovery with a retained failed job under the lease token', () => {
  it('re-dispatches the unleased event so its job acquires the lease', async () => {
    const stored = await ingestStripeEvent(
      createStripeRecoveryEvent({ subscriptionId: `sub_${randomUUID()}` }),
    )
    const jobId = `stripe-event__${stored.id}__${stored.lease_token}`
    const neighbor = await createRecoverableStripeEvent()
    const before = await getStripeEventById(neighbor.id)

    try {
      // A job that stalls past its limit, or fails before it leases the event, leaves exactly this.
      await expect(memberships.revoke(jobId)).resolves.toBe('revoked')
      await expect((await memberships.getJob(jobId))?.getState()).resolves.toBe('failed')
      await makeStripeEventRecoverableForTest(stored.id, 'unstarted')

      await expect(recoverStripeEvents([stored.id], 2)).resolves.toEqual({
        enqueued: 1,
        hasMore: false,
      })
      await expect(getStripeEventById(neighbor.id)).resolves.toEqual(before)
      await expect(
        memberships.getJob(`stripe-event__${neighbor.id}__${neighbor.lease_token}`),
      ).resolves.toBeNull()

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
