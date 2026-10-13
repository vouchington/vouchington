import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getActorUri } from '@modules/activitypub-uris'
import { generateRsaSha256KeyPair, verifySignature } from '@modules/http-signatures'
import { QUEUE_NAME } from '@queues/activitypub/config'
import { activitypub } from '@queues/activitypub/queues'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import {
  activityPubInboxDeliveryTransitions,
  dispatchInboundActivity,
} from '@services/ap-inbox-activities'
import {
  deliverActivityToInbox,
  type DeliverActivityToInboxInput,
} from '@services/activitypub-delivery'
import { getOrFetchRemoteActorByKeyId } from '@services/remote-actors'
import { updateUserFields } from '@services/users'
import {
  activityPubInboxDeliveryExistsOnPrimaryForTest,
  createTestUserDirect,
  expireActivityPubInboxDeliveryForTest,
  makeActivityPubInboxDeliveryRecoverableForTest,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { scopedActivityPubInboxProcessors } from '@voucha/test-helpers/activitypub-inbox-scoped-processors'
import type { ActivityPubInboxJobProcessors } from './processors/inbox-job.mts'
import {
  claimTestDelivery,
  exhaustTestDelivery,
} from '@voucha/test-helpers/services/ap-inbox-activities/durable-delivery-transitions.test-support'
import {
  createApprovedRemoteActor,
  createSignedDelivery,
} from '@voucha/test-helpers/workers/activitypub-inbox/test-support'
import { processActivityPubJob } from './processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

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

async function runJob(
  name: string,
  data: Record<string, unknown>,
  captured: CapturedRequest[] = [],
  priority = 10,
  inboxProcessors?: ActivityPubInboxJobProcessors,
): Promise<unknown> {
  const prefix = `${workerQueuePrefix}-activitypub-${randomUUID()}`
  const queue = new Queue(QUEUE_NAME, { connection: workerQueueConnection, prefix })
  let worker: Worker | undefined
  const completed = Promise.withResolvers<unknown>()
  try {
    const job = await queue.add(name, data, { priority, attempts: 1 })
    if (!job) throw new Error(`Expected ${name} to enqueue`)
    worker = new Worker(
      QUEUE_NAME,
      (current: Job) =>
        processActivityPubJob(current, {
          deliverActivityToInbox: networkBoundary(captured),
          inboxProcessors,
        }),
      { connection: workerQueueConnection, prefix, concurrency: 1, blockTimeout: 1000 },
    )
    worker.on('error', error => completed.reject(error))
    worker.on('failed', (_failed, error) => completed.reject(error))
    worker.on('completed', (done: Job, result) => {
      if (done.id === job.id) completed.resolve(result)
    })
    return await completed.promise
  } finally {
    await worker?.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

function runScopedMaintenanceJob(name: string, deliveryId: string): Promise<unknown> {
  return runJob(name, {}, [], 100, scopedActivityPubInboxProcessors(deliveryId))
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

describe('activitypub shared real worker', () => {
  it('distributes a page and delivers a signed activity through the external socket boundary', async () => {
    const source = await createFederatedUser()
    const target = await createFederatedUser()
    const remote = await createRemoteFollower(source.id)
    const activityId = randomUUID()
    const distribution = await runJob('distributeActivity', {
      activityId,
      activityType: 'Follow',
      sourceUserId: source.id,
      targetUserId: target.id,
    })
    expect(distribution).toMatchObject({ enqueued: 1, completed: true })
    const child = (await readAllQueueJobs(activitypub)).find(
      job =>
        job.name === 'deliverActivity' &&
        (job.data as { activityId?: string }).activityId === activityId,
    )
    expect(child?.name).toBe('deliverActivity')
    const captured: CapturedRequest[] = []
    try {
      const { public_key_pem: publicKeyPem } = await getOrCreateActorKeyPair(source.id)
      await expect(
        runJob('deliverActivity', child!.data as Record<string, unknown>, captured),
      ).resolves.toEqual({
        delivered: true,
      })
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

  it('processes a durable inbound delivery and recovers an abandoned one', async () => {
    const actor = await createApprovedRemoteActor()
    const deliveredActivityId = `${actor.actorUri}/activities/${randomUUID()}`
    const delivered = await createSignedDelivery(actor, { activityId: deliveredActivityId })
    await runJob('processDelivery', delivered)
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(deliveredActivityId)).toBe(false)

    const abandoned = await createSignedDelivery(actor)
    await makeActivityPubInboxDeliveryRecoverableForTest(abandoned.deliveryId, 'unstarted')
    const result = await runScopedMaintenanceJob('recoverDeliveries', abandoned.deliveryId)
    expect((result as { enqueued: number }).enqueued).toBeGreaterThanOrEqual(1)
    const recovered = (await readAllQueueJobs(activitypub)).find(
      job =>
        job.name === 'processDelivery' &&
        (job.data as { deliveryId?: string }).deliveryId === abandoned.deliveryId,
    )
    try {
      expect(recovered?.name).toBe('processDelivery')
      expect((recovered?.data as { deliveryId?: string } | undefined)?.deliveryId).toBe(
        abandoned.deliveryId,
      )
    } finally {
      await recovered?.remove()
      if (recovered)
        await activityPubInboxDeliveryTransitions.reject(
          abandoned.deliveryId,
          (recovered.data as { leaseToken: string }).leaseToken,
        )
    }
  })

  it('defers a remote 429 through the shared worker without consuming an attempt', async () => {
    const source = await createFederatedUser()
    await getOrCreateActorKeyPair(source.id)
    const prefix = `${workerQueuePrefix}-activitypub-rate-${randomUUID()}`
    const queue = new Queue(QUEUE_NAME, { connection: workerQueueConnection, prefix })
    let worker: Worker | undefined
    const settled = Promise.withResolvers<void>()
    try {
      const job = await queue.add(
        'deliverActivity',
        {
          activityId: randomUUID(),
          activityType: 'Accept',
          sourceUserId: source.id,
          inboxUrl: `https://remote-${randomUUID()}.example/inbox`,
          followActivityId: randomUUID(),
          followActorUri: `https://remote-${randomUUID()}.example/users/follower`,
        },
        { priority: 10, attempts: 5 },
      )
      if (!job) throw new Error('Expected delivery job to enqueue')
      const captured: CapturedRequest[] = []
      worker = new Worker(
        QUEUE_NAME,
        (current: Job) =>
          processActivityPubJob(current, {
            deliverActivityToInbox: networkBoundary(captured, 429),
          }),
        { connection: workerQueueConnection, prefix, concurrency: 1, blockTimeout: 1000 },
      )
      worker.on('error', error => settled.reject(error))
      worker.on('failed', (_failed, error) => settled.reject(error))
      worker.on('completed', () => settled.reject(new Error('Rate-limited job completed')))
      worker.on('active', active => {
        if (active.id === job.id) worker?.once('drained', () => settled.resolve())
      })
      await settled.promise
      const delayed = await queue.getJob(job.id)
      expect(await delayed?.getState()).toBe('delayed')
      expect(delayed?.attemptsMade).toBe(0)
      expect(captured).toHaveLength(1)
    } finally {
      await worker?.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('rearms a failed durable delivery and deletes an expired one', async () => {
    const actor = await createApprovedRemoteActor()
    const failed = await createSignedDelivery(actor)
    expect(await claimTestDelivery(failed.deliveryId, failed.leaseToken)).not.toBeNull()
    expect(
      await exhaustTestDelivery(failed.deliveryId, failed.leaseToken, new Error('offline')),
    ).toBe(true)
    const rearmed = await runScopedMaintenanceJob('rearmFailedDeliveries', failed.deliveryId)
    expect((rearmed as { enqueued: number }).enqueued).toBeGreaterThanOrEqual(1)
    const jobs = await readAllQueueJobs(activitypub)
    const child = jobs.find(
      job =>
        job.name === 'processDelivery' &&
        (job.data as { deliveryId?: string }).deliveryId === failed.deliveryId,
    )
    try {
      expect((child?.data as { leaseToken?: string } | undefined)?.leaseToken).not.toBe(
        failed.leaseToken,
      )
    } finally {
      await child?.remove()
      if (child)
        await activityPubInboxDeliveryTransitions.reject(
          failed.deliveryId,
          (child.data as { leaseToken: string }).leaseToken,
        )
    }

    const expiredActivityId = `${actor.actorUri}/activities/${randomUUID()}`
    const expired = await createSignedDelivery(actor, { activityId: expiredActivityId })
    await expireActivityPubInboxDeliveryForTest(expired.deliveryId)
    const cleanup = await runScopedMaintenanceJob('cleanupExpiredDeliveries', expired.deliveryId)
    expect(cleanup).toMatchObject({ deletedRows: expect.any(Number) })
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(expiredActivityId)).toBe(false)
  })
})
