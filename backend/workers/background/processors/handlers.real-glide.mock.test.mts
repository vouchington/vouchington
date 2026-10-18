import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { FEDIVERSE_INSTANCES_CLASSIFY_JOB } from '@queues/background/enqueues/fediverse-instances-jobs'
import { background } from '@queues/background/queues'
import { createTestUserDirect, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createInstanceFromHostname } from '@services/fediverse-instances/create-instance'
import { getFediverseInstanceAttributes } from '@services/fediverse-instances/get-attributes'
import { createBackgroundWorker } from '../workers/create-worker.mts'
import { BACKGROUND_HANDLERS } from './handlers.mts'

const { host: HOST } = vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
  const host = `fedi-nodeinfo-${crypto.randomUUID()}.example.com`
  vi.stubEnv('FEDIVERSE_MASTODON_HOST', host)
  return { host }
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

/* no-mistakes: integration=nodeinfo */
const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: fetchSpy }
})

const NODEINFO_URL = `https://${HOST}/nodeinfo/2.0`
const NODEINFO_DOCUMENT = {
  version: '2.0',
  software: { name: 'mastodon', version: '4.2.1' },
  protocols: ['activitypub'],
  openRegistrations: true,
  usage: { users: { total: 1000, activeMonth: 250 } },
}

describe('createInstanceFromHostname — queued NodeInfo classification', () => {
  it('retries a transient NodeInfo failure, then persists metadata after the real job completes', async () => {
    fetchSpy.mockReset()
    const releaseNodeInfo = Promise.withResolvers<void>()
    const nodeInfoStarted = Promise.withResolvers<void>()
    fetchSpy.mockImplementationOnce(async () => {
      nodeInfoStarted.resolve()
      await releaseNodeInfo.promise
      return new Response('NodeInfo temporarily unavailable', { status: 503 })
    })
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: NODEINFO_URL }],
        }),
        { status: 200 },
      ),
    )
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(NODEINFO_DOCUMENT), { status: 200 }))

    const user = await createTestUserDirect()

    const worker = createBackgroundWorker({
      handlers: BACKGROUND_HANDLERS,
      domains: ['fediverse-instances'],
    })
    const completed = Promise.withResolvers<Job>()
    let failedAttempts = 0
    worker.on('completed', job => {
      if (job.name === FEDIVERSE_INSTANCES_CLASSIFY_JOB.name) completed.resolve(job)
    })
    worker.on('failed', (job, error) => {
      if (job?.name !== FEDIVERSE_INSTANCES_CLASSIFY_JOB.name) return
      failedAttempts += 1
      if (failedAttempts >= (FEDIVERSE_INSTANCES_CLASSIFY_JOB.options.attempts ?? 1)) {
        completed.reject(error)
      }
    })
    worker.on('error', error => completed.reject(error))

    try {
      await worker.waitUntilReady()
      const result = await createInstanceFromHostname(user, WEB_PROVENANCE, HOST)
      expect(result.status).toBe('created')

      expect(await getFediverseInstanceAttributes(result.topic_id)).toMatchObject({
        software: null,
        protocol: null,
        nodeinfo_raw: null,
        integration_status: 'pending',
      })

      await nodeInfoStarted.promise
      releaseNodeInfo.resolve()
      const job = await completed.promise
      expect(job.data).toMatchObject({ topicId: result.topic_id, hostnameId: expect.any(String) })
      expect(job.opts.ordering).toMatchObject({ key: 'fediverse-instances', concurrency: 5 })
      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(failedAttempts).toBe(1)
      expect(await getFediverseInstanceAttributes(result.topic_id)).toMatchObject({
        software: 'mastodon',
        protocol: 'activitypub',
        nodeinfo_software_version: '4.2.1',
        total_users: 1000,
        monthly_active_users: 250,
        is_open_for_registrations: true,
        nodeinfo_raw: NODEINFO_DOCUMENT,
        integration_status: 'pending',
      })
    } finally {
      releaseNodeInfo.resolve()
      await closeAndUnregisterGlideMQInstance(worker)
      await background.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(background)
    }
  })
})
