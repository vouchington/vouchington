import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { TestJob } from 'glide-mq/testing'
import type { WorkerQueryProfile } from '../backend/test-helpers/query-profiles.mts'

describe('public SDK worker profiling adapter', () => {
  it.each([false, true])(
    'profiles an app-factory job through the adapter alias (reset modules: %s)',
    async resetModules => {
      if (resetModules) vi.resetModules()
      const [
        { closeAndUnregisterGlideMQInstance, createWorker },
        { Queue },
        { RequestQueryProfileWorker },
        { observeQueryProfile },
      ] = await Promise.all([
        import('../backend/data-stores/valkey-glide-mq/glide-mq-factory.mts'),
        import('glide-mq'),
        import('./request-query-profile-worker.mts'),
        import('../backend/test-helpers/query-profiles.mts'),
      ])
      const queueName = `app-factory-profile-${crypto.randomUUID()}`
      const queue = new Queue<{ value: number }, number>(queueName, {})
      let closeWorker: (() => Promise<void>) | undefined
      let removeJob: (() => Promise<void>) | undefined
      let stopObserving: () => void = () => undefined
      onTestFinished(async () => {
        const errors: unknown[] = []
        for (const close of [closeWorker, removeJob, () => queue.close()]) {
          if (!close) continue
          try {
            await close()
          } catch (err) {
            errors.push(err)
          }
        }
        stopObserving()
        if (errors.length) throw new AggregateError(errors, 'App-factory profile cleanup failed')
      })

      const calls: string[] = []
      const worker = createWorker<{ value: number }, number>(queueName, async job => {
        calls.push('processor')
        observeQueryProfile({ durationMs: 0, annotation: 'appFactoryWorker' })
        return job.data.value
      })
      closeWorker = () => closeAndUnregisterGlideMQInstance(worker)
      if (!(worker instanceof RequestQueryProfileWorker)) {
        throw new Error('The default GlideMQ adapter did not return the request-profile worker')
      }

      const profiles: WorkerQueryProfile[] = []
      stopObserving = RequestQueryProfileWorker.prototype.observeQueryProfiles.call(
        worker,
        profile => {
          profiles.push(profile)
          return undefined
        },
      )
      const job = await queue.add('actual-profiled-job', { value: 12 })
      if (!job) throw new Error('The owned profile queue did not admit its job')
      removeJob = () => job.remove()

      expect(await job.getState()).toBe('completed')
      expect((await queue.getJob(job.id))?.returnvalue).toBe(12)
      expect(calls).toEqual(['processor'])
      expect(profiles).toHaveLength(1)
      expect(profiles[0]?.identity).toEqual({
        queue: queueName,
        jobs: [{ id: job.id, name: 'actual-profiled-job' }],
      })
      expect(profiles[0]?.queries()).toEqual([
        expect.objectContaining({ annotation: 'appFactoryWorker' }),
      ])
    },
  )

  it('composes the caller processor wrapper before profile collection', async () => {
    const [{ Queue }, { RequestQueryProfileWorker }] = await Promise.all([
      import('@vouchington/worker-runtime/testing'),
      import('./request-query-profile-worker.mts'),
    ])
    const queue = new Queue<{ value: number }, number>(`wrapped-${crypto.randomUUID()}`)
    const calls: string[] = []
    const wrappedQueues: string[] = []
    const worker = new RequestQueryProfileWorker(
      queue,
      async (job: TestJob<{ value: number }, number>) => {
        calls.push('processor')
        return job.data.value
      },
      {
        wrapProcessor: (processor, queueName) => {
          wrappedQueues.push(queueName)
          return async (job: TestJob<{ value: number }, number>) => {
            calls.push('caller')
            return processor(job)
          }
        },
      },
    )
    let jobId: string | undefined
    const profiles: WorkerQueryProfile[] = []
    const stopObserving = worker.observeQueryProfiles(profile => {
      profiles.push(profile)
      return undefined
    })
    onTestFinished(async () => {
      stopObserving()
      await worker.close()
      if (jobId) await queue.getJob(jobId).then(job => job?.remove())
      await queue.close()
    })

    const job = await queue.add('wrapped-job', { value: 7 })
    if (!job) throw new Error('The wrapped profile queue did not admit its job')
    jobId = job.id
    expect(await job.getState()).toBe('completed')
    expect((await queue.getJob(job.id))?.returnvalue).toBe(7)
    expect(wrappedQueues).toEqual([queue.name])
    expect(calls).toEqual(['caller', 'processor'])
    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.identity.jobs).toEqual([{ id: job.id, name: 'wrapped-job' }])
  })
})
