import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Queue, QueueEvents, Worker, type Job, type JobOptions } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as httpDispatchers from '../../../modules/utils/http.mts'
import {
  MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS,
  membershipVerificationOrdering,
  membershipVerificationQueueConfig,
  QUEUE_NAME,
} from '@queues/memberships/config'
import { memberships } from '@queues/memberships/queues'
import { createMembershipVerification } from '@services/memberships'
import {
  createTestLaunchedNativeMembershipPurchaseIntent,
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createMockAgentFetchForTest, MockAgent } from '@voucha/test-helpers/provider-http'
import { realGlideConnection } from '@voucha/test-helpers/real-glide-connection'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { rejectUnavailableMembershipProvider } from '@services/memberships/provider-unavailable'
import { processMembershipVerificationJob } from './process-verification-job.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = realGlideConnection
const PENDING_DELAY_MS = 60_000,
  RATE_LIMIT_DELAY_MS = 30_000
const verificationOptions = (verificationId: string): JobOptions => ({
  attempts: 3,
  jobId: verificationId,
  lockDuration: MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS,
  ordering: membershipVerificationOrdering(verificationId),
  deduplication: { id: verificationId, mode: 'simple' },
})

describe('membership verification job deferral with real PostgreSQL and GlideMQ', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('paces pending and throttled purchases without attempts or starvation', async ({ signal }) => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    const pendingProviderRequested = Promise.withResolvers<void>()
    const releasePendingProvider = Promise.withResolvers<void>()
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', `queue-test-${randomUUID()}@example.test`)
    vi.stubEnv(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY',
      privateKey.export({ format: 'pem', type: 'pkcs8' }),
    )
    const applicationId = `ai.voucha.queue-${randomUUID()}`
    const targetProductId = `plus.monthly.${randomUUID()}`
    const currentProductId = `pro.monthly.${randomUUID()}`
    const pendingToken = `pending-${randomUUID()}`
    const rateLimitedToken = `rate-${randomUUID()}`
    const providerUrls: string[] = []
    const agentFetch = createMockAgentFetchForTest(agent)
    const providerFetch: ReturnType<typeof httpDispatchers.getExternalFetch> = async (
      input,
      init,
    ) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      providerUrls.push(url)
      if (url.includes(pendingToken)) {
        pendingProviderRequested.resolve()
        await releasePendingProvider.promise
      }
      return agentFetch(input, init)
    }
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(providerFetch)
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const target = await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: targetProductId,
      basePlanId: 'target-plan',
    })
    const purchaseIntentId = await createTestLaunchedNativeMembershipPurchaseIntent({
      userId: user.id,
      membershipProviderProductId: target.id,
    })
    const pending = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: pendingToken },
    })
    const rateLimited = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId },
      evidence: { purchase_token: rateLimitedToken },
    })
    await Promise.all([
      (await memberships.getJob(pending.id))?.remove(),
      (await memberships.getJob(rateLimited.id))?.remove(),
    ])
    agent
      .get('https://oauth2.googleapis.com')
      .intercept({ path: '/token', method: 'POST' })
      .reply(200, { access_token: 'synthetic-access-token', expires_in: 3600 })
    agent
      .get('https://androidpublisher.googleapis.com')
      .intercept({ path: googlePlayPath(applicationId, pendingToken), method: 'GET' })
      .reply(200, {
        latestOrderId: `order-${randomUUID()}`,
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        testPurchase: {},
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
        },
        lineItems: [
          {
            productId: currentProductId,
            expiryTime: new Date(Date.now() + 86_400_000).toISOString(),
            deferredItemReplacement: { productId: targetProductId },
          },
          { productId: targetProductId },
        ],
      })
    agent
      .get('https://androidpublisher.googleapis.com')
      .intercept({ path: googlePlayPath(applicationId, rateLimitedToken), method: 'GET' })
      .reply(429, {}, { headers: { 'retry-after': '30' } })

    const queueName = `${QUEUE_NAME}_verification_delay_${randomUUID()}`
    const queue = new Queue(queueName, connection)
    const events = new QueueEvents(queueName, {
      ...connection,
      lastEventId: '0',
      blockTimeout: 1_000,
    })
    const restoreConfig = overrideDynamicConfigFieldsForTest(membershipVerificationQueueConfig, {
      verification_concurrency: 1,
      verification_retry_minutes: 1,
    })
    const worker = new Worker(queueName, (job: Job) => processMembershipVerificationJob(job), {
      ...connection,
      concurrency: 2,
      blockTimeout: 1_000,
    })
    const failedJobIds: string[] = []
    events.on('failed', event => failedJobIds.push(event.jobId))

    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
      const pendingJob = await addVerificationJob(queue, pending.id)
      await waitForRealGlideEvent(
        pendingProviderRequested.promise,
        `Google Play pending request ${pendingJob.id}`,
      )

      const contentionStartedAt = Date.now()
      const contentionOutcome = nextVerificationOutcome(events, signal)
      const rateLimitedJob = await addVerificationJob(queue, rateLimited.id)
      await expectDelayOutcome({
        outcome: contentionOutcome,
        queue,
        job: rateLimitedJob,
        startedAt: contentionStartedAt,
        minDelayMs: 1_000,
        maxDelayMs: 1_500,
      })
      expect(providerUrls.some(url => url.includes(rateLimitedToken))).toBe(false)

      const pendingStartedAt = Date.now()
      const pendingOutcome = nextVerificationOutcome(events, signal)
      releasePendingProvider.resolve()
      await expectDelayOutcome({
        outcome: pendingOutcome,
        queue,
        job: pendingJob,
        startedAt: pendingStartedAt,
        minDelayMs: PENDING_DELAY_MS,
        maxDelayMs: PENDING_DELAY_MS,
      })
      await expectCanonicalDelay(queue, pendingJob, pending.id)

      const rateLimitStartedAt = Date.now()
      const rateLimitOutcome = nextVerificationOutcome(events, signal)
      await rateLimitedJob.promote()
      await expectDelayOutcome({
        outcome: rateLimitOutcome,
        queue,
        job: rateLimitedJob,
        startedAt: rateLimitStartedAt,
        minDelayMs: RATE_LIMIT_DELAY_MS,
        maxDelayMs: RATE_LIMIT_DELAY_MS,
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
      await Promise.all([worker.close(true), events.close()])
      await queue.obliterate({ force: true })
      await queue.close()
      await agent.close()
      await Promise.all([
        rejectUnavailableMembershipProvider(pending.id),
        rejectUnavailableMembershipProvider(rateLimited.id),
      ])
      await Promise.all([
        (await memberships.getJob(pending.id))?.remove(),
        (await memberships.getJob(rateLimited.id))?.remove(),
      ])
    }
  })
})

function nextVerificationOutcome(events: QueueEvents, signal: AbortSignal) {
  return Promise.race([
    once(events, 'delay-changed', { signal }).then(([event]) => ({
      kind: 'delayed' as const,
      event,
    })),
    once(events, 'completed', { signal }).then(([event]) => ({
      kind: 'completed' as const,
      event,
    })),
    once(events, 'failed', { signal }).then(([event]) => ({
      kind: 'failed' as const,
      event,
    })),
  ])
}

async function addVerificationJob(queue: Queue, verificationId: string): Promise<Job> {
  const job = await queue.add(
    'processMembershipVerification',
    { verificationId },
    verificationOptions(verificationId),
  )
  if (!job) throw new Error(`Expected ${verificationId} verification job`)
  return job
}

async function expectDelayOutcome(options: {
  outcome: ReturnType<typeof nextVerificationOutcome>
  queue: Queue
  job: Job
  startedAt: number
  minDelayMs: number
  maxDelayMs: number
}): Promise<void> {
  const result = await waitForRealGlideEvent(
    options.outcome,
    `GlideMQ membership verification delay ${options.job.id}`,
  )
  expect(result.kind).toBe('delayed')
  const event = result.event
  expect(event).toMatchObject({ jobId: options.job.id })
  const delayMs = Number((event as { delay: string }).delay)
  const elapsedMs = Date.now() - options.startedAt
  expect(delayMs).toBeGreaterThanOrEqual(options.minDelayMs - elapsedMs)
  expect(delayMs).toBeLessThanOrEqual(options.maxDelayMs)
  const stored = await options.queue.getJob(options.job.id)
  expect(await stored?.getState()).toBe('delayed')
  expect(stored?.attemptsMade).toBe(0)
}

async function expectCanonicalDelay(queue: Queue, job: Job, verificationId: string): Promise<void> {
  const stored = await queue.getJob(job.id)
  expect(await stored?.getState()).toBe('delayed')
  expect(stored?.attemptsMade).toBe(0)
  await expect(
    queue.add(
      'processMembershipVerification',
      { verificationId },
      verificationOptions(verificationId),
    ),
  ).resolves.toBeNull()
  expect(await stored?.getState()).toBe('delayed')
}

function googlePlayPath(applicationId: string, purchaseToken: string): string {
  return `/androidpublisher/v3/applications/${applicationId}/purchases/subscriptionsv2/tokens/${purchaseToken}`
}
