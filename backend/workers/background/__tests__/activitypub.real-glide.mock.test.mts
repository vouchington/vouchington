import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getActorUri } from '@modules/activitypub-uris'
import { mintUUIDv7 } from '@modules/utils/ids'
import { generateRsaSha256KeyPair, verifySignature } from '@modules/http-signatures'
import {
  ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
  ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import { background } from '@queues/background/queues'
import {
  deliverActivityToInbox,
  prepareActivityDistributionPage,
  releaseActivityDistributionPage,
  type DeliverActivityToInboxInput,
} from '@services/activitypub-delivery'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import { dispatchInboundActivity } from '@services/ap-inbox-activities'
import { getOrFetchRemoteActorByKeyId } from '@services/remote-actors'
import { updateUserFields } from '@services/users'
import {
  processDeliverActivityJob,
  processDistributeActivityJob,
} from '@workers/activitypub/processors'
import { createTestUserDirect, readAllQueueJobs } from '@voucha/test-helpers'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

type CapturedRequest = { url: string; body: string; headers: Record<string, string> }

function networkBoundary(captured: CapturedRequest[], status = 202) {
  return (input: DeliverActivityToInboxInput) =>
    deliverActivityToInbox(input, {
      validateUrl: async () => [{ address: '93.184.216.34', family: 4 }],
      fetch: vi.fn<VitestLooseMock>(async (url: string, init: Record<string, unknown>) => {
        captured.push({
          url,
          body: init.body as string,
          headers: init.headers as Record<string, string>,
        })
        return new Response(null, {
          status,
          ...(status === 429 ? { headers: { 'Retry-After': '120' } } : {}),
        })
      }),
    })
}

async function createFederatedUser() {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { is_fediverse_federation_enabled: true })
  return user
}

async function createRemoteFollower(userId: string) {
  const actorUri = `https://remote-${randomUUID()}.example/users/follower`
  const keyId = `${actorUri}#main-key`
  const actor = await getOrFetchRemoteActorByKeyId(keyId, {
    validateUrl: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchWithTimeout: async () => ({
      response: new Response(
        JSON.stringify({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: { id: keyId, publicKeyPem: generateRsaSha256KeyPair().publicKeyPem },
        }),
        { status: 200 },
      ),
      responseSignal: new AbortController().signal,
    }),
  })
  await dispatchInboundActivity(actor, {
    id: `${actorUri}/activities/${randomUUID()}`,
    type: 'Follow',
    actor: actor.actor_uri,
    object: getActorUri(userId),
  })
  return actor
}

describe('activitypub through the production background processor', () => {
  let harness: BackgroundHarness | undefined
  /** Resolves each time the production processor has finished with a job, however it ended. */
  let processed: PromiseWithResolvers<void>

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  async function startWith(
    deliver: (job: Job) => unknown = job => processDeliverActivityJob(job),
  ): Promise<BackgroundHarness> {
    processed = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: handlers => {
        const processor = createBackgroundProcessor(handlers)
        return async job => {
          try {
            return await processor(job)
          } finally {
            processed.resolve()
          }
        }
      },
      bodies: {
        [ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name]: job => processDistributeActivityJob(job),
        [ACTIVITYPUB_DELIVER_ACTIVITY_JOB.name]: deliver,
      },
    })
    return harness
  }

  /**
   * The worker applies a job's deferral after its processor returns, and this worker runs one job at
   * a time, so a job added afterwards that has completed proves the deferral was already applied.
   */
  async function afterDeferralApplied(started: BackgroundHarness): Promise<void> {
    const sentinel = await started.add(SES_INBOUND_PROCESS_JOB, {
      sesMessageId: `sentinel-${randomUUID()}`,
      objectKey: 'copyright-incoming/sentinel',
    })
    await expect(started.settled(sentinel)).resolves.toBe('completed')
  }

  it('distributes a page and delivers a signed activity through the external socket boundary', async () => {
    const source = await createFederatedUser()
    const target = await createFederatedUser()
    const remote = await createRemoteFollower(source.id)
    const activityId = mintUUIDv7()
    const captured: CapturedRequest[] = []
    const started = await startWith(job =>
      processDeliverActivityJob(job, {
        deliverActivityToInbox: networkBoundary(captured),
      }),
    )
    const distribute = await started.add(
      ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
      { activityId, activityType: 'Follow', sourceUserId: source.id, targetUserId: target.id },
      { attempts: 1 },
    )
    await expect(started.settled(distribute)).resolves.toBe('completed')
    expect((await started.queue.getJob(distribute.id))?.returnvalue).toMatchObject({
      enqueued: 1,
      completed: true,
    })
    // The page's delivery job is enqueued on the production queue; run it on the same processor.
    const child = (await readAllQueueJobs(background)).find(
      job =>
        job.name === ACTIVITYPUB_DELIVER_ACTIVITY_JOB.name &&
        (job.data as { activityId?: string }).activityId === activityId,
    )
    expect(child).toBeDefined()
    try {
      const { public_key_pem: publicKeyPem } = await getOrCreateActorKeyPair(source.id)
      const deliver = await started.add(ACTIVITYPUB_DELIVER_ACTIVITY_JOB, child!.data as object, {
        attempts: 1,
      })
      await expect(started.settled(deliver)).resolves.toBe('completed')
      expect((await started.queue.getJob(deliver.id))?.returnvalue).toEqual({ delivered: true })
      expect(captured).toHaveLength(1)
      const request = captured[0]!
      const url = new URL(request.url)
      expect(request.url).toBe(remote.inbox_url)
      expect(
        verifySignature(
          'POST',
          url.pathname + url.search,
          url.host,
          request.body,
          request.headers.signature!,
          request.headers.digest!,
          request.headers.date!,
          publicKeyPem,
        ).valid,
      ).toBe(true)
    } finally {
      await child?.remove()
    }
  })

  it('delays a distribution job while its durable page lease is held', async () => {
    const source = await createFederatedUser()
    const target = await createFederatedUser()
    const activityId = mintUUIDv7()
    const page = await prepareActivityDistributionPage(activityId, source.id)
    if (page.status !== 'ready') throw new Error('Expected to claim a distribution page')
    try {
      const started = await startWith()
      const job = await started.add(
        ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
        { activityId, activityType: 'Follow', sourceUserId: source.id, targetUserId: target.id },
        { attempts: 5 },
      )
      await started.activated(job, 1)
      await processed.promise
      await afterDeferralApplied(started)
      const delayed = await started.queue.getJob(job.id)
      expect(await delayed?.getState()).toBe('delayed')
      expect(delayed?.attemptsMade).toBe(0)
    } finally {
      await releaseActivityDistributionPage(activityId, page.leaseToken)
    }
  })

  it('defers a remote 429 through the shared worker without consuming an attempt', async () => {
    const source = await createFederatedUser()
    await getOrCreateActorKeyPair(source.id)
    const captured: CapturedRequest[] = []
    const started = await startWith(job =>
      processDeliverActivityJob(job, { deliverActivityToInbox: networkBoundary(captured, 429) }),
    )
    const job = await started.add(
      ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
      {
        activityId: randomUUID(),
        activityType: 'Accept',
        sourceUserId: source.id,
        inboxUrl: `https://remote-${randomUUID()}.example/inbox`,
        followActivityId: randomUUID(),
        followActorUri: `https://remote-${randomUUID()}.example/users/follower`,
      },
      { attempts: 5 },
    )
    await started.activated(job, 1)
    await processed.promise
    await afterDeferralApplied(started)
    const delayed = await started.queue.getJob(job.id)
    expect(await delayed?.getState()).toBe('delayed')
    expect(delayed?.attemptsMade).toBe(0)
    expect(captured).toHaveLength(1)
  })

  it('runs a delivery job through its processor', async () => {
    const started = await startWith()
    const job = await started.add(
      ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
      {
        activityId: randomUUID(),
        activityType: 'Accept',
        sourceUserId: randomUUID(),
        inboxUrl: 'https://remote.example.test/inbox',
        followActivityId: randomUUID(),
        followActorUri: 'https://remote.example.test/actor',
      },
      { attempts: 1 },
    )
    await expect(started.settled(job)).resolves.toBe('completed')
    expect((await started.queue.getJob(job.id))?.returnvalue).toEqual({
      delivered: false,
      reason: 'federation-disabled',
    })
  })
})
