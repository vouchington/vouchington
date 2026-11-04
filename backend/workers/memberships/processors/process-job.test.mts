import { acquireTestPostgresAdvisoryLock } from '@voucha/test-helpers/postgres-advisory-lock'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import * as ses from '@modules/aws/ses'
import * as stripeSubscriptions from '@modules/stripe/subscriptions'
import { memberships } from '@queues/memberships/queues'
import * as membershipsService from '@services/memberships'
import {
  claimAdministratorRefundRequest,
  leaseDueRefundReconciliation,
  scheduleRefundReconciliationRetry,
} from '@services/memberships'
import { ingestStripeEvent } from '@services/stripe/events'
import {
  createTestMembership,
  createTestUser,
  retireTestMembershipProviderProduct,
} from '@voucha/test-helpers'
import {
  createStripeEvent,
  createUniqueStripeId,
} from '@voucha/test-helpers/membership-stripe-fixtures'
import { createTestRenewalEmail } from '@voucha/test-helpers/renewal-email'
import { getTestStripeEventByStripeEventId } from '@voucha/test-helpers/stripe-event-readers'
import { cleanupRefundReconciliationOperationsForTest } from '../../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import { readAllQueueJobs } from '../../../test-helpers/queue-jobs.mts'
import { processMembershipJob } from './process-job.mts'

describe('processMembershipJob', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues a sync job for each due pause collection', async () => {
    const userId = randomUUID()
    const requestedAt = '2026-10-11T00:00:00.000Z'
    vi.spyOn(membershipsService, 'dispatchDuePauseCollectionWork').mockResolvedValue([
      { userId, requestedAt, leaseToken: 'pause-lease-1' },
    ])

    await processMembershipJob(job('dispatchMembershipPauseCollection'))

    const queued = (await readAllQueueJobs(memberships)).filter(
      queuedJob => (queuedJob.data as { userId?: string }).userId === userId,
    )
    expect(queued.map(queuedJob => [queuedJob.name, queuedJob.data])).toEqual([
      ['syncMembershipPauseCollection', { userId, requestedAt, leaseToken: 'pause-lease-1' }],
    ])
  })

  it('sends the renewal price increase email for an owned membership', async () => {
    const sendEmail = vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
    const user = await createTestUser()
    const { data, renewalProductId } = await createTestRenewalEmail(user.id)

    await processMembershipJob(job('processSendRenewalPriceIncreaseEmail', data))

    expect(sendEmail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: user.email_address,
        subject: 'Your Voucha Pro renewal price is changing',
      }),
    )
    await retireTestMembershipProviderProduct(renewalProductId)
  })

  it.each([
    { attemptsMade: 2, attempts: 3, failed: true },
    { attemptsMade: 1, attempts: 3, failed: false },
    { attemptsMade: 0, attempts: undefined, failed: true },
  ])(
    'fails a Stripe event only on its last attempt ($attemptsMade of $attempts)',
    async ({ attemptsMade, attempts, failed }) => {
      const failure = new Error('handler failed')
      vi.spyOn(stripeSubscriptions, 'getStripeSubscription').mockRejectedValue(failure)
      const stored = await ingestStripeEvent(
        createStripeEvent('invoice.payment_failed', {
          id: createUniqueStripeId('in', 'process-job'),
          object: 'invoice',
          customer: createUniqueStripeId('cus', 'process-job'),
          subscription: createUniqueStripeId('sub', 'process-job'),
        }),
      )

      await expect(
        processMembershipJob({
          name: 'processStripeEvent',
          data: {
            stripeEventRecordId: stored.id,
            leaseToken: stored.lease_token,
            stripeSubscriptionId: stored.subscription_id,
            isLiveMode: stored.is_live_mode,
          },
          timestamp: Date.now(),
          attemptsMade,
          opts: { attempts },
        } as unknown as Job),
      ).rejects.toBe(failure)

      const event = await getTestStripeEventByStripeEventId(stored.stripe_event_id)
      expect(event?.last_error_message).toBe('handler failed')
      expect(event?.failed_at instanceof Date).toBe(failed)
    },
  )

  it('completes a Stripe event that needs no membership change', async () => {
    const stored = await ingestStripeEvent(
      createStripeEvent('customer.created', { id: createUniqueStripeId('cus', 'process-job') }),
    )

    await processMembershipJob({
      name: 'processStripeEvent',
      data: {
        stripeEventRecordId: stored.id,
        leaseToken: stored.lease_token,
        stripeSubscriptionId: stored.subscription_id,
        isLiveMode: stored.is_live_mode,
      },
      timestamp: Date.now(),
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job)

    const event = await getTestStripeEventByStripeEventId(stored.stripe_event_id)
    expect(event?.status).toBe('ignored')
    expect(event?.ignored_at instanceof Date).toBe(true)
    expect(event?.processed_at).toBeNull()
    expect(event?.failed_at).toBeNull()
    expect(event?.last_error_message).toBeNull()
  })

  it('dispatches due refund reconciliations through the default processor', async () => {
    const reservation = await acquireTestPostgresAdvisoryLock({
      namespace: 2_135_050,
      key: 1,
      timeout: '2s',
    })
    onTestFinished(() => reservation.release())
    const [member, administrator] = await Promise.all([createTestUser(), createTestUser()])
    const membership = await createTestMembership({
      user_id: member.id,
      stripe_subscription_id: `sub_worker_dispatch_${randomUUID()}`,
    })
    const operation = await claimAdministratorRefundRequest({
      amount: { amount: 700, currency: 'usd' },
      cancelRequested: false,
      idempotencyKey: `worker-dispatch-${randomUUID()}`,
      issuedById: administrator.id,
      membershipId: membership.id,
      note: null,
      periodEndsAt: null,
      periodStartedAt: null,
      providerPaymentReference: `ch_worker_dispatch_${randomUUID()}`,
      providerSubscriptionReference: null,
      reason: 'requested',
      requestFingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'),
    })
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected reconciliation lease')
    await scheduleRefundReconciliationRetry(lease, new Date('1900-01-01'), 'worker test setup')

    try {
      await processMembershipJob(job('dispatchMembershipRefundReconciliation'))

      expect(await readAllQueueJobs(memberships)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({ operationId: operation.id }),
            name: 'reconcileMembershipRefundOperation',
          }),
        ]),
      )
    } finally {
      await cleanupRefundReconciliationOperationsForTest([operation.id])
      const ownedJobs = (await readAllQueueJobs(memberships)).filter(
        queued => (queued.data as { operationId?: string }).operationId === operation.id,
      )
      await Promise.all(ownedJobs.map(queued => queued.remove()))
    }
  })
})

function job(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data, timestamp: Date.now(), attemptsMade: 2, opts: { attempts: 3 } } as Job
}
