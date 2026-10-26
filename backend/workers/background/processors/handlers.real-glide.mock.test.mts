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
  // The real worker retains its 5s blocking read and graceful shutdown budgets.
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

    const completed = Promise.withResolvers<Job>()
    const firstFailure = Promise.withResolvers<Job>()
    let failedAttempts = 0
    let worker: ReturnType<typeof createBackgroundWorker> | undefined
    const admission = Promise.withResolvers<Job | null>()
    const originalAdd = background.add
    const add = vi.spyOn(background, 'add').mockImplementation((name, data, options) => {
      const job = originalAdd.call(background, name, data, options)
      if (name === FEDIVERSE_INSTANCES_CLASSIFY_JOB.name) {
        void job.then(admission.resolve, admission.reject)
      }
      return job
    })

    try {
      const result = await createInstanceFromHostname(user, WEB_PROVENANCE, HOST)
      expect(result.status).toBe('created')

      expect(await getFediverseInstanceAttributes(result.topic_id)).toMatchObject({
        software: null,
        protocol: null,
        nodeinfo_raw: null,
        integration_status: 'pending',
      })

      const admitted = await admission.promise
      expect(admitted?.data).toMatchObject({ topicId: result.topic_id })
      worker = createBackgroundWorker({
        handlers: BACKGROUND_HANDLERS,
        domains: ['fediverse-instances'],
      })
      worker.on('completed', job => {
        if (job.name === FEDIVERSE_INSTANCES_CLASSIFY_JOB.name) completed.resolve(job)
      })
      worker.on('failed', (job, error) => {
        if (job?.name !== FEDIVERSE_INSTANCES_CLASSIFY_JOB.name) return
        failedAttempts += 1
        if (failedAttempts === 1) firstFailure.resolve(job)
        if (failedAttempts >= (FEDIVERSE_INSTANCES_CLASSIFY_JOB.options.attempts ?? 1)) {
          completed.reject(error)
        }
      })
      worker.on('error', error => completed.reject(error))

      await worker.waitUntilReady()

      await nodeInfoStarted.promise
      releaseNodeInfo.resolve()
      const retry = await firstFailure.promise
      expect(retry.data).toMatchObject({ topicId: result.topic_id })
      expect(await retry.getState()).toBe('delayed')
      await retry.promote()
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
      add.mockRestore()
      if (worker) await closeAndUnregisterGlideMQInstance(worker)
      await background.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(background)
    }
  }, 15_000)
})
