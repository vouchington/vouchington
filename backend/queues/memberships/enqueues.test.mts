import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  enqueueBulkProcessStripeWebhooks,
  enqueueBulkProcessMembershipVerifications,
  enqueueBulkSendRenewalPriceIncreaseEmail,
  enqueueDeliverMembershipEntitlementEffects,
  enqueueExpireElapsedMemberships,
  enqueueProcessMembershipVerification,
  enqueueRecoverMembershipVerifications,
  enqueueProcessStripeWebhook,
  enqueueReconcileStripeMembershipCatalog,
} from './enqueues.mts'
import {
  MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
  MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
  STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
} from './config.mts'
import { memberships } from './queues.mts'

const QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

describe('membership enqueues', () => {
  it('uses the durable verification id as the job identity', async () => {
    const verificationId = randomUUID()
    await enqueueProcessMembershipVerification({ verificationId })
    const jobs = (await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state)))).flat()
    expect(jobs.find(job => job.id === `membership-verification__${verificationId}`)).toMatchObject(
      {
        data: { verificationId },
        opts: {
          removeOnComplete: true,
          removeOnFail: true,
          deduplication: { id: `membership-verification__${verificationId}`, mode: 'simple' },
        },
      },
    )
  })

  it('bulk-enqueues recoverable verification rows with IDs that terminal retention releases', async () => {
    const verificationId = randomUUID()
    const [job] = await enqueueBulkProcessMembershipVerifications([{ verificationId }])

    expect(job).toMatchObject({
      id: `membership-verification__${verificationId}`,
      data: { verificationId },
      opts: {
        removeOnComplete: true,
        removeOnFail: true,
        deduplication: { id: `membership-verification__${verificationId}`, mode: 'simple' },
      },
    })
  })

  it('uses a throttled five-minute bucket for verification recovery', async () => {
    await memberships.obliterate({ force: true })
    const timeBucket = 5_666_666
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(timeBucket * 300_000 + 123)
    try {
      await enqueueRecoverMembershipVerifications()
      const jobs = (await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state)))).flat()
      expect(
        jobs.find(job => job.id === `membership-verification-recovery__${timeBucket}`),
      ).toMatchObject({
        data: {},
        opts: {
          deduplication: {
            id: 'membership-verification-recovery',
            mode: 'throttle',
            ttl: 300_000,
          },
        },
      })
    } finally {
      dateNow.mockRestore()
      await memberships.obliterate({ force: true })
    }
  })

  it('uses Stripe record and attempt database ids as the job and dedup ids', async () => {
    const stripeEventRecordId = randomUUID()
    const processingAttemptId = randomUUID()
    const stripeSubscriptionId = `sub_${randomUUID()}`
    const jobId = `stripe-webhook__${stripeEventRecordId}__${processingAttemptId}`
    await enqueueProcessStripeWebhook({
      stripeEventRecordId,
      processingAttemptId,
      stripeSubscriptionId,
      livemode: true,
    })
    const jobs = (
      await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state, 0, -1)))
    ).flat()
    expect(jobs.find(job => job.id === jobId)).toMatchObject({
      id: jobId,
      data: { stripeEventRecordId, processingAttemptId, stripeSubscriptionId, livemode: true },
      opts: {
        deduplication: { id: jobId, mode: 'simple' },
        ordering: { key: `stripe-subscription:production:${stripeSubscriptionId}`, concurrency: 1 },
      },
    })
  })

  it('does not serialize Stripe events without a normalized subscription id', async () => {
    const stripeEventRecordId = randomUUID()
    const processingAttemptId = randomUUID()
    const jobId = `stripe-webhook__${stripeEventRecordId}__${processingAttemptId}`
    await enqueueProcessStripeWebhook({
      stripeEventRecordId,
      processingAttemptId,
      stripeSubscriptionId: null,
      livemode: false,
    })
    const jobs = (
      await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state, 0, -1)))
    ).flat()
    expect(jobs.find(job => job.id === jobId)).toMatchObject({
      data: {
        stripeEventRecordId,
        processingAttemptId,
        stripeSubscriptionId: null,
        livemode: false,
      },
    })
    expect(jobs.find(job => job.id === jobId)?.opts.ordering).toBeUndefined()
  })

  it('uses the same logical ids for recovered bulk jobs', async () => {
    const data = {
      stripeEventRecordId: randomUUID(),
      processingAttemptId: randomUUID(),
      stripeSubscriptionId: `sub_${randomUUID()}`,
      livemode: false,
    }
    const jobId = `stripe-webhook__${data.stripeEventRecordId}__${data.processingAttemptId}`
    const [job] = await enqueueBulkProcessStripeWebhooks([data])
    expect(job).toMatchObject({
      id: jobId,
      data,
      opts: {
        deduplication: { id: jobId, mode: 'simple' },
        ordering: {
          key: `stripe-subscription:test:${data.stripeSubscriptionId}`,
          concurrency: 1,
        },
      },
    })
  })

  it('deduplicates renewal delivery by membership and provider observation', async () => {
    const data = {
      userId: randomUUID(),
      membershipId: randomUUID(),
      membershipProviderObservationId: randomUUID(),
    }
    await enqueueBulkSendRenewalPriceIncreaseEmail([data])
    const jobs = (
      await Promise.all(
        (['waiting', 'active', 'completed', 'failed'] as const).map(state =>
          memberships.getJobs(state),
        ),
      )
    ).flat()
    const job = jobs.find(
      candidate => (candidate.data as { membershipId?: string }).membershipId === data.membershipId,
    )
    expect(job).toMatchObject({
      data,
      opts: {
        deduplication: {
          id: `processSendRenewalPriceIncreaseEmail__${data.membershipId}__${data.membershipProviderObservationId}`,
          mode: 'debounce',
        },
      },
    })
  })

  it('dispatches entitlement effects with no projection data in Valkey', async () => {
    await memberships.obliterate({ force: true })
    const timeBucket = 28_333_333
    const dateNow = vi
      .spyOn(Date, 'now')
      .mockReturnValue(timeBucket * MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS + 123)
    try {
      await enqueueDeliverMembershipEntitlementEffects()
      const jobs = (
        await Promise.all(
          (['waiting', 'active', 'completed', 'failed'] as const).map(state =>
            memberships.getJobs(state),
          ),
        )
      ).flat()
      const jobId = `membership-entitlement-effects__${timeBucket}`
      const job = jobs.find(candidate => candidate.id === jobId)

      expect(job).toMatchObject({
        id: jobId,
        opts: {
          deduplication: {
            id: 'membership-entitlement-effects',
            mode: 'throttle',
            ttl: 60_000,
          },
        },
      })
      expect(job?.data).toStrictEqual({})
    } finally {
      dateNow.mockRestore()
      await memberships.obliterate({ force: true })
    }
  })

  it('dispatches grant expiry from durable PostgreSQL state', async () => {
    await memberships.obliterate({ force: true })
    const timeBucket = 28_333_333
    const dateNow = vi
      .spyOn(Date, 'now')
      .mockReturnValue(timeBucket * MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS + 123)
    try {
      await enqueueExpireElapsedMemberships()
      const jobs = (
        await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state, 0, -1)))
      ).flat()
      const jobId = `membership-grant-expiry__${timeBucket}`
      expect(jobs.find(job => job.id === jobId)).toMatchObject({
        id: jobId,
        data: {},
        opts: {
          deduplication: {
            id: 'membership-grant-expiry',
            mode: 'throttle',
            ttl: MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
          },
        },
      })
    } finally {
      dateNow.mockRestore()
      await memberships.obliterate({ force: true })
    }
  })

  it('deduplicates serialized Stripe catalog reconciliation in each schedule bucket', async () => {
    await memberships.obliterate({ force: true })
    const timeBucket = 5_666_666
    const dateNow = vi
      .spyOn(Date, 'now')
      .mockReturnValue(timeBucket * STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS + 123)
    try {
      await enqueueReconcileStripeMembershipCatalog()
      await enqueueReconcileStripeMembershipCatalog()
      const jobs = (await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state)))).flat()
      expect(jobs.filter(job => job.id === `stripe-catalog__${timeBucket}`)).toHaveLength(1)
      expect(jobs.find(job => job.id === `stripe-catalog__${timeBucket}`)).toMatchObject({
        data: {},
        opts: {
          deduplication: {
            id: 'stripe-catalog',
            mode: 'throttle',
            ttl: STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
          },
          ordering: { key: 'stripe-catalog:voucha-web', concurrency: 1 },
        },
      })
    } finally {
      dateNow.mockRestore()
      await memberships.obliterate({ force: true })
    }
  })
})
