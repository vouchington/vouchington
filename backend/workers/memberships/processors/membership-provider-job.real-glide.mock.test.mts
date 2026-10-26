import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Queue, QueueEvents, Worker, type Job, type JobOptions } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import * as httpDispatchers from '../../../modules/utils/http.mts'
import { membershipVerificationQueueConfig, QUEUE_NAME } from '@queues/memberships/config'
import { buildGooglePlayNotificationJob } from '@queues/memberships/enqueues/google-play-jobs'
import {
  acquireMembershipVerificationExecutionLease,
  releaseMembershipVerificationExecutionLease,
  type MembershipVerificationExecutionLease,
} from '@queues/memberships/enqueues/verification-execution-lease'
import { createTestGooglePlayRtdnEvidence } from '@voucha/test-helpers/google-play-memberships'
import { createTestGooglePlayRtdnBody } from '@voucha/test-helpers/google-play-recovery'
import { getTestMembershipProviderEvidenceTerminalState } from '@voucha/test-helpers/entities/memberships/provider-evidence'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createMockAgentFetchForTest, MockAgent } from '@voucha/test-helpers/provider-http'
import { realGlideConnection } from '@voucha/test-helpers/real-glide-connection'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { processGooglePlayNotification } from './google-play.mts'
import { processMembershipProviderJob } from './membership-provider-job.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = realGlideConnection

describe('Google Play notification admission through the shared provider lease', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('delays an unbound RTDN lookup until the shared lease is available', async ({ signal }) => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    const providerUrls: string[] = []
    const agentFetch = createMockAgentFetchForTest(agent)
    const providerFetch: ReturnType<typeof httpDispatchers.getExternalFetch> = async (
      input,
      init,
    ) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      providerUrls.push(url)
      return agentFetch(input, init)
    }
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(providerFetch)

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', `queue-test-${randomUUID()}@example.test`)
    vi.stubEnv(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY',
      privateKey.export({ format: 'pem', type: 'pkcs8' }),
    )

    const applicationId = `com.voucha.test.${randomUUID().replaceAll('-', '')}`
    const purchaseToken = `unbound-${randomUUID()}`
    const evidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: createTestGooglePlayRtdnBody(applicationId, {
        subscriptionNotification: {
          notificationType: 2,
          purchaseToken,
          subscriptionId: `plus.monthly.${randomUUID()}`,
        },
      }),
    })

    agent
      .get('https://oauth2.googleapis.com')
      .intercept({ path: '/token', method: 'POST' })
      .reply(200, { access_token: 'synthetic-access-token', expires_in: 3600 })
    agent
      .get('https://androidpublisher.googleapis.com')
      .intercept({
        path: `/androidpublisher/v3/applications/${applicationId}/purchases/subscriptionsv2/tokens/${purchaseToken}`,
        method: 'GET',
      })
      .reply(200, {
        latestOrderId: `order-${randomUUID()}`,
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        testPurchase: {},
        lineItems: [],
      })

    const queueName = `${QUEUE_NAME}_provider_lease_${randomUUID()}`
    const queue = new Queue(queueName, connection)
    const events = new QueueEvents(queueName, {
      ...connection,
      lastEventId: '0',
      blockTimeout: 1_000,
    })
    const leaseNamespace = `${workerQueuePrefix}:{memberships}:rtdn-provider-test:${randomUUID()}`
    const restoreConfig = overrideDynamicConfigFieldsForTest(membershipVerificationQueueConfig, {
      verification_concurrency: 1,
    })
    const worker = new Worker(
      queueName,
      (job: Job) =>
        processMembershipProviderJob(
          job,
          () => processGooglePlayNotification({ evidenceId: job.data.evidenceId }),
          { leaseNamespace },
        ),
      { ...connection, concurrency: 1, blockTimeout: 1_000, promotionInterval: 100 },
    )
    let heldLease: MembershipVerificationExecutionLease | null = null

    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
      heldLease = await acquireMembershipVerificationExecutionLease(leaseNamespace)
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
      await expect(
        getTestMembershipProviderEvidenceTerminalState(evidenceId),
      ).resolves.toMatchObject({
        verified_at: null,
        rejected_at: null,
        observation_count: 0,
      })

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
      ).resolves.toMatchObject({
        verified_at: null,
        rejected_at: null,
        observation_count: 0,
      })
    } finally {
      if (heldLease) await releaseMembershipVerificationExecutionLease(heldLease)
      restoreConfig()
      await Promise.all([worker.close(true), events.close()])
      await queue.obliterate({ force: true })
      await queue.close()
      await agent.close()
    }
  })
})
