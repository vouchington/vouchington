import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB,
  MEMBERSHIPS_GRANT_EXPIRY_JOB,
  MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB,
  MEMBERSHIPS_VERIFICATION_JOB,
} from '@queues/background/enqueues/memberships-jobs-2'
import {
  MEMBERSHIPS_STRIPE_CATALOG_JOB,
  MEMBERSHIPS_STRIPE_EVENT_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import { readEnqueuedJob } from '../../test-helpers/queue-jobs.mts'
import {
  forgetDedupEntries,
  removeQueuedJobsById,
} from '../../test-helpers/shared-queue-cleanup.mts'
import {
  enqueueBulkProcessStripeEvents,
  enqueueBulkProcessMembershipVerifications,
  enqueueBulkSendRenewalPriceIncreaseEmail,
  enqueueDeliverMembershipEntitlementEffects,
  enqueueExpireElapsedMemberships,
  enqueueProcessMembershipVerification,
  enqueueRecoverMembershipVerifications,
  enqueueProcessStripeEvent,
  enqueueReconcileStripeMembershipCatalog,
} from './enqueues.mts'
import {
  MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
  MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
  STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
} from './config.mts'
import { memberships } from './queues.mts'

/** Runs a test that pins the clock to a schedule bucket, leaving no job or throttle window behind. */
async function withPinnedBucket(
  timeBucket: number,
  intervalMs: number,
  dedupId: string,
  jobId: string,
  run: () => Promise<void>,
): Promise<void> {
  forgetDedupEntries(BACKGROUND_QUEUE_NAME, [dedupId])
  const dateNow = vi.spyOn(Date, 'now').mockReturnValue(timeBucket * intervalMs + 123)
  try {
    await run()
  } finally {
    dateNow.mockRestore()
    await removeQueuedJobsById(memberships, [jobId])
    forgetDedupEntries(BACKGROUND_QUEUE_NAME, [dedupId])
  }
}

describe('membership enqueues', () => {
  it('uses the durable verification id as the job identity', async () => {
    const verificationId = randomUUID()
    const queued = await readEnqueuedJob(
      memberships,
      await enqueueProcessMembershipVerification({ verificationId }),
    )
    expect(queued).toMatchObject({
      id: `membership-verification__${verificationId}`,
      name: MEMBERSHIPS_VERIFICATION_JOB.name,
      data: { verificationId },
      opts: {
        priority: 10,
        removeOnComplete: true,
        removeOnFail: true,
        deduplication: { id: `membership-verification__${verificationId}`, mode: 'simple' },
      },
    })
    expect(queued.opts.ordering).toBeUndefined()
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
    const timeBucket = 5_666_666
    const jobId = `membership-verification-recovery__${timeBucket}`
    await withPinnedBucket(
      timeBucket,
      300_000,
      'membership-verification-recovery',
      jobId,
      async () => {
        await enqueueRecoverMembershipVerifications()
        expect(await memberships.getJob(jobId)).toMatchObject({
          data: {},
          opts: {
            priority: 100,
            deduplication: {
              id: 'membership-verification-recovery',
              mode: 'throttle',
              ttl: 300_000,
            },
          },
        })
      },
    )
  })

  it('uses Stripe record and attempt database ids as the job and dedup ids', async () => {
    const stripeEventRecordId = randomUUID()
    const leaseToken = randomUUID()
    const stripeSubscriptionId = `sub_${randomUUID()}`
    const jobId = `stripe-event__${stripeEventRecordId}__${leaseToken}`
    const queued = await readEnqueuedJob(
      memberships,
      await enqueueProcessStripeEvent({
        stripeEventRecordId,
        leaseToken,
        stripeSubscriptionId,
        isLiveMode: true,
      }),
    )
    expect(queued).toMatchObject({
      id: jobId,
      name: MEMBERSHIPS_STRIPE_EVENT_JOB.name,
      data: { stripeEventRecordId, leaseToken, stripeSubscriptionId, isLiveMode: true },
      opts: {
        attempts: 3,
        deduplication: { id: jobId, mode: 'simple' },
        ordering: {
          key: `memberships:stripe-subscription:production:${stripeSubscriptionId}`,
          concurrency: 1,
        },
      },
    })
  })

  it('does not serialize Stripe events without a normalized subscription id', async () => {
    const stripeEventRecordId = randomUUID()
    const leaseToken = randomUUID()
    const queued = await readEnqueuedJob(
      memberships,
      await enqueueProcessStripeEvent({
        stripeEventRecordId,
        leaseToken,
        stripeSubscriptionId: null,
        isLiveMode: false,
      }),
    )
    expect(queued.data).toEqual({
      stripeEventRecordId,
      leaseToken,
      stripeSubscriptionId: null,
      isLiveMode: false,
    })
    expect(queued.opts.ordering).toBeUndefined()
  })

  it('uses the same logical ids for recovered bulk jobs', async () => {
    const data = {
      stripeEventRecordId: randomUUID(),
      leaseToken: randomUUID(),
      stripeSubscriptionId: `sub_${randomUUID()}`,
      isLiveMode: false,
    }
    const jobId = `stripe-event__${data.stripeEventRecordId}__${data.leaseToken}`
    const [job] = await enqueueBulkProcessStripeEvents([data])
    expect(job).toMatchObject({
      id: jobId,
      data,
      opts: {
        deduplication: { id: jobId, mode: 'simple' },
        ordering: {
          key: `memberships:stripe-subscription:test:${data.stripeSubscriptionId}`,
          concurrency: 1,
        },
      },
    })
  })

  it('deduplicates renewal delivery by membership, observation and generation', async () => {
    const data = {
      userId: randomUUID(),
      membershipId: randomUUID(),
      membershipProviderObservationId: randomUUID(),
      generation: '1',
    }
    await enqueueBulkSendRenewalPriceIncreaseEmail([data])
    const [job] = await memberships.searchJobs({
      name: MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB.name,
      data: { membershipId: data.membershipId },
    })
    expect(job).toMatchObject({
      name: MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB.name,
      data,
      opts: {
        priority: 10,
        deduplication: {
          id: `processSendRenewalPriceIncreaseEmail__${data.membershipId}__${data.membershipProviderObservationId}__${data.generation}`,
          mode: 'debounce',
        },
      },
    })
  })

  it('dispatches entitlement effects with no projection data in Valkey', async () => {
    const timeBucket = 28_333_333
    const jobId = `membership-entitlement-effects__${timeBucket}`
    await withPinnedBucket(
      timeBucket,
      MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
      'membership-entitlement-effects',
      jobId,
      async () => {
        await enqueueDeliverMembershipEntitlementEffects()
        const job = await memberships.getJob(jobId)

        expect(job).toMatchObject({
          id: jobId,
          name: MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB.name,
          opts: {
            deduplication: { id: 'membership-entitlement-effects', mode: 'throttle', ttl: 60_000 },
          },
        })
        expect(job?.data).toStrictEqual({})
      },
    )
  })

  it('dispatches grant expiry from durable PostgreSQL state', async () => {
    const timeBucket = 28_333_333
    const jobId = `membership-grant-expiry__${timeBucket}`
    await withPinnedBucket(
      timeBucket,
      MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
      'membership-grant-expiry',
      jobId,
      async () => {
        await enqueueExpireElapsedMemberships()
        expect(await memberships.getJob(jobId)).toMatchObject({
          id: jobId,
          name: MEMBERSHIPS_GRANT_EXPIRY_JOB.name,
          data: {},
          opts: {
            deduplication: {
              id: 'membership-grant-expiry',
              mode: 'throttle',
              ttl: MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
            },
          },
        })
      },
    )
  })

  it('deduplicates serialized Stripe catalog reconciliation in each schedule bucket', async () => {
    const timeBucket = 5_666_666
    const jobId = `stripe-catalog__${timeBucket}`
    await withPinnedBucket(
      timeBucket,
      STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
      'stripe-catalog',
      jobId,
      async () => {
        await enqueueReconcileStripeMembershipCatalog()
        await expect(enqueueReconcileStripeMembershipCatalog()).resolves.toBeNull()
        expect(await memberships.getJob(jobId)).toMatchObject({
          name: MEMBERSHIPS_STRIPE_CATALOG_JOB.name,
          data: {},
          opts: {
            attempts: 5,
            deduplication: {
              id: 'stripe-catalog',
              mode: 'throttle',
              ttl: STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
            },
            ordering: { key: 'memberships:stripe-catalog:voucha-web', concurrency: 1 },
          },
        })
      },
    )
  })
})
