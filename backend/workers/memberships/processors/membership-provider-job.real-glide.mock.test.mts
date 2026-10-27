import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Worker, type Job, type JobOptions } from 'glide-mq'
import { throwRateLimited } from '@vouchington/queue-errors'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { membershipVerificationQueueConfig } from '@queues/memberships/config'
import { buildGooglePlayNotificationJob } from '@queues/memberships/enqueues/google-play-jobs'
import {
  acquireMembershipVerificationExecutionLease,
  membershipVerificationLeaseNamespace,
  releaseMembershipVerificationExecutionLease,
  renewMembershipVerificationExecutionLease,
  type MembershipVerificationExecutionLease,
} from '@queues/memberships/enqueues/verification-execution-lease'
import { GooglePlayPurchasePendingError } from '@services/memberships/google/process-verification'
import { MembershipProviderUnavailableError } from '@services/memberships/provider-unavailable'
import {
  cleanUpGooglePlayDeferralFixtures,
  createGooglePlayDeferralFixtures,
  createUnboundGooglePlayRtdnFixture,
} from '@voucha/test-helpers/google-play-deferral-fixtures'
import { stubGooglePlayProvider } from '@voucha/test-helpers/google-play-provider-stub'
import { getTestMembershipProviderEvidenceTerminalState } from '@voucha/test-helpers/entities/memberships/provider-evidence'
import { deleteMembershipVerificationLeaseSlots } from '@voucha/test-helpers/membership-verification-lease'
import {
  addVerificationJob,
  expectCanonicalDelay,
  expectDelayAfter,
  openMembershipQueueHarness,
} from '@voucha/test-helpers/membership-verification-queue-assertions'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { processGooglePlayNotification } from './google-play.mts'
import { processMembershipProviderJob } from './membership-provider-job.mts'
import { processMembershipVerificationJob } from './process-verification-job.mts'
import { runWithMembershipVerificationLeaseRenewal } from './verification-execution-renewal.mts'

// Every test touching the real shared lease slots lives here; a file runs its tests sequentially.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('membership verification execution lease with real Valkey', () => {
  it('bounds contention and fences renewal and release by owner token', async () => {
    const keys = [0, 1].map(slot => `${membershipVerificationLeaseNamespace}:slot:${slot}`)
    const restoreConfig = overrideDynamicConfigFieldsForTest(membershipVerificationQueueConfig, {
      verification_concurrency: 2,
    })
    try {
      const first = await acquireMembershipVerificationExecutionLease()
      const second = await acquireMembershipVerificationExecutionLease()
      if (!first || !second) throw new Error('Expected two verification execution leases')
      expect(new Set([first.key, second.key])).toEqual(new Set(keys))
      await expect(acquireMembershipVerificationExecutionLease()).resolves.toBeNull()

      const forged: MembershipVerificationExecutionLease = {
        key: first.key,
        token: randomUUID(),
      }
      await expect(renewMembershipVerificationExecutionLease(forged)).resolves.toBe(false)
      await expect(releaseMembershipVerificationExecutionLease(forged)).resolves.toBe(false)
      await expect(workerQueueCommandClient.get(first.key)).resolves.toBe(first.token)

      await expect(renewMembershipVerificationExecutionLease(first)).resolves.toBe(true)
      const ttl = await workerQueueCommandClient.pttl(first.key)
      expect(ttl).toBeGreaterThan(50_000)
      expect(ttl).toBeLessThanOrEqual(60_000)
      await expect(
        runWithMembershipVerificationLeaseRenewal(first, async () => 'renewed'),
      ).resolves.toBe('renewed')

      await expect(releaseMembershipVerificationExecutionLease(first)).resolves.toBe(true)
      const operation = vi.fn<() => Promise<void>>(async () => undefined)
      await expect(runWithMembershipVerificationLeaseRenewal(first, operation)).rejects.toThrow(
        'lost ownership',
      )
      expect(operation).not.toHaveBeenCalled()
      await expect(releaseMembershipVerificationExecutionLease(second)).resolves.toBe(true)
      await expect(workerQueueCommandClient.get(second.key)).resolves.toBeNull()
    } finally {
      restoreConfig()
      await workerQueueCommandClient.unlink(keys)
    }
  })
})

describe('Google Play notification admission through the shared provider lease', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('delays an unbound RTDN lookup until the shared lease is available', async ({ signal }) => {
    const { agent, providerUrls } = stubGooglePlayProvider()
    const { evidenceId, purchaseToken } = await createUnboundGooglePlayRtdnFixture(agent)
    const restoreConfig = overrideDynamicConfigFieldsForTest(membershipVerificationQueueConfig, {
      verification_concurrency: 1,
    })
    const { queue, events, close } = await openMembershipQueueHarness(
      'provider_lease',
      (job: Job) =>
        processMembershipProviderJob(job, () =>
          processGooglePlayNotification({ evidenceId: job.data.evidenceId }),
        ),
      { concurrency: 1, blockTimeout: 100, promotionInterval: 100 },
    )
    let heldLease: MembershipVerificationExecutionLease | null = null

    try {
      heldLease = await acquireMembershipVerificationExecutionLease()
      if (!heldLease) throw new Error('Expected to reserve the provider execution slot')

      const notification = buildGooglePlayNotificationJob({
        evidenceId,
        purchaseToken,
        environment: 'test',
      })
      const delayChanged = once(events, 'delay-changed', { signal })
      const job = await queue.add('processGooglePlayNotification', notification.data, {
        ...notification.opts,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: true,
      } satisfies JobOptions)
      if (!job) throw new Error('Expected the isolated queue to accept the RTDN job')

      const [delayedEvent] = await waitForRealGlideEvent(
        delayChanged,
        `GlideMQ RTDN provider lease deferral ${job.id}`,
      )
      expect(delayedEvent).toMatchObject({ jobId: job.id })
      const delayedJob = await queue.getJob(job.id)
      expect(await delayedJob?.getState()).toBe('delayed')
      expect(delayedJob?.attemptsMade).toBe(0)
      expect(providerUrls).toEqual([])
      const untouched = { verified_at: null, rejected_at: null, observation_count: 0 }
      await expect(
        getTestMembershipProviderEvidenceTerminalState(evidenceId),
      ).resolves.toMatchObject(untouched)

      expect(await releaseMembershipVerificationExecutionLease(heldLease)).toBe(true)
      heldLease = null
      const completed = once(events, 'completed', { signal })
      await job.promote()
      await expect(
        waitForRealGlideEvent(completed, `GlideMQ unbound RTDN completion ${job.id}`),
      ).resolves.toEqual([expect.objectContaining({ jobId: job.id })])

      expect(providerUrls).toHaveLength(2)
      expect(providerUrls[0]).toBe('https://oauth2.googleapis.com/token')
      expect(providerUrls[1]).toContain(`/tokens/${purchaseToken}`)
      agent.assertNoPendingInterceptors()
      await expect(
        getTestMembershipProviderEvidenceTerminalState(evidenceId),
      ).resolves.toMatchObject(untouched)
    } finally {
      if (heldLease) await releaseMembershipVerificationExecutionLease(heldLease)
      restoreConfig()
      await close()
      await agent.close()
    }
  })
})

describe('membership provider job when the execution lease is lost before release', () => {
  let restoreConfig: (() => void) | undefined

  afterEach(() => restoreConfig?.())

  async function run(failure: (() => unknown) | null) {
    restoreConfig = overrideDynamicConfigFieldsForTest(membershipVerificationQueueConfig, {
      verification_concurrency: 1,
    })
    const moveToDelayed = vi.fn<Job['moveToDelayed']>()
    const outcome = processMembershipProviderJob({ moveToDelayed } as unknown as Job, async () => {
      // Expiry or a takeover removes the slot while the provider call is still running.
      await deleteMembershipVerificationLeaseSlots(1)
      if (failure) throw failure()
    })
    return { outcome, moveToDelayed }
  }

  it.each([
    ['a pending Google Play purchase', () => new GooglePlayPurchasePendingError()],
    ['a provider rate limit', providerRateLimitSignal],
    [
      'an unavailable provider configuration',
      () => new MembershipProviderUnavailableError('unset'),
    ],
  ])('delays %s instead of burning a failed attempt', async (_name, failure) => {
    const { outcome, moveToDelayed } = await run(failure)

    await expect(outcome).resolves.toBeUndefined()
    expect(moveToDelayed).toHaveBeenCalledOnce()
    expect(moveToDelayed.mock.calls[0]![0]).toBeGreaterThan(0)
  })

  it('still fails the attempt for an ordinary failure', async () => {
    const { outcome, moveToDelayed } = await run(() => new Error('boom'))

    await expect(outcome).rejects.toThrow('lease lost before release')
    expect(moveToDelayed).not.toHaveBeenCalled()
  })
})

describe('membership verification job deferral with real PostgreSQL and GlideMQ', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('paces pending and throttled purchases without attempts or starvation', async ({ signal }) => {
    const pendingProviderRequested = Promise.withResolvers<void>()
    const releasePendingProvider = Promise.withResolvers<void>()
    let pendingToken = ''
    const { agent, providerUrls } = stubGooglePlayProvider(async url => {
      if (!url.includes(pendingToken)) return
      pendingProviderRequested.resolve()
      await releasePendingProvider.promise
    })
    const fixtures = await createGooglePlayDeferralFixtures(agent)
    pendingToken = fixtures.pendingToken
    const { pending, rateLimited, rateLimitedToken } = fixtures
    const restoreConfig = overrideDynamicConfigFieldsForTest(membershipVerificationQueueConfig, {
      verification_concurrency: 1,
      verification_retry_minutes: 1,
    })
    const { queue, events, close } = await openMembershipQueueHarness(
      'verification_delay',
      processMembershipVerificationJob,
      { concurrency: 2 },
    )
    const failedJobIds: string[] = []
    events.on('failed', event => failedJobIds.push(event.jobId))

    try {
      const pendingJob = await addVerificationJob(queue, pending.id)
      await waitForRealGlideEvent(
        pendingProviderRequested.promise,
        `Google Play pending request ${pendingJob.id}`,
      )

      const rateLimitedJob = await expectDelayAfter({
        events,
        signal,
        queue,
        minDelayMs: 1_000,
        maxDelayMs: 1_500,
        trigger: () => addVerificationJob(queue, rateLimited.id),
      })
      expect(providerUrls.some(url => url.includes(rateLimitedToken))).toBe(false)

      await expectDelayAfter({
        events,
        signal,
        queue,
        job: pendingJob,
        minDelayMs: 60_000,
        maxDelayMs: 60_000,
        trigger: () => releasePendingProvider.resolve(),
      })
      await expectCanonicalDelay(queue, pendingJob, pending.id)

      await expectDelayAfter({
        events,
        signal,
        queue,
        job: rateLimitedJob,
        minDelayMs: 30_000,
        maxDelayMs: 30_000,
        trigger: () => rateLimitedJob.promote(),
      })
      await expectCanonicalDelay(queue, rateLimitedJob, rateLimited.id)

      const completed = once(events, 'completed', { signal })
      const sibling = await addVerificationJob(queue, randomUUID())
      await expect(
        waitForRealGlideEvent(completed, `GlideMQ membership verification sibling ${sibling.id}`),
      ).resolves.toEqual([expect.objectContaining({ jobId: sibling.id })])
      expect(failedJobIds).toEqual([])
      agent.assertNoPendingInterceptors()
    } finally {
      releasePendingProvider.resolve()
      restoreConfig()
      await close()
      await agent.close()
      await cleanUpGooglePlayDeferralFixtures(fixtures)
    }
  })
})

function providerRateLimitSignal(): unknown {
  try {
    return throwRateLimited(2_000, new Error('provider rate limit'), {
      RateLimitError: Worker.RateLimitError,
    })
  } catch (err) {
    return err
  }
}
