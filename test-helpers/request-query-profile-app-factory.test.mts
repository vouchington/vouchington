import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { WorkerQueryProfile } from '../backend/test-helpers/query-profiles.mts'

describe('worker query profile adapter', () => {
  it.each([false, true])(
    'profiles an app-factory job through the glide-mq alias (reset modules: %s)',
    async resetModules => {
      if (resetModules) vi.resetModules()
      const [
        { closeAndUnregisterGlideMQInstance, createWorker },
        { Queue },
        { Worker },
        { observeQueryProfile },
      ] = await Promise.all([
        import('../backend/data-stores/valkey-glide-mq/glide-mq-factory.mts'),
        import('glide-mq'),
        import('./worker-query-profile.mts'),
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
      if (!(worker instanceof Worker)) {
        throw new Error('The default GlideMQ adapter did not return the profiled worker')
      }
      // createWorker is declared as the glide-mq Worker. Its private fields do not match this alias.
      const profiled = worker as InstanceType<typeof Worker>

      const profiles: WorkerQueryProfile[] = []
      stopObserving = profiled.observeQueryProfiles(profile => {
        profiles.push(profile)
        return undefined
      })
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
})
