import { AsyncLocalStorage } from 'node:async_hooks'
import type { Job, Queue } from 'glide-mq'
import { vi } from 'vitest'
import { ENTITY_LISTENERS_POST_CREATED_JOB } from '../queues/background/enqueues/entity-listeners-jobs.mts'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '../queues/background/enqueues/vote-aggregation-jobs.mts'
import type * as Retry from '../data-stores/valkey-glide-mq/glide-mq-retry.mts'

export type ElectionAdmission = {
  phase: 'creation' | 'votes'
  ids: string[]
  jobs: Promise<unknown>
}

/** Call through public producers; register every started promise before its first effect. */
export function createElectionInstrumentation(
  entityQueue: Queue,
  statsQueue: Queue,
  retry: typeof Retry,
) {
  const entityJobs: Array<{ entityId: string; job: Promise<Job | null> }> = []
  const admissions: ElectionAdmission[] = []
  const started: Promise<unknown>[] = []
  const restores: Array<() => void> = []
  const context = new AsyncLocalStorage<ElectionAdmission>()
  let phase: ElectionAdmission['phase'] = 'creation'
  let closing = false
  let cursor = 0
  const assertOpen = () => {
    if (closing) throw new Error('Owned election producer scope is closing')
  }
  return {
    entityJobs,
    admissions,
    install() {
      assertOpen()
      const add = entityQueue.add
      const addSpy = vi.spyOn(entityQueue, 'add').mockImplementation((name, data, options) => {
        assertOpen()
        const job = Promise.resolve().then(() =>
          Reflect.apply(add, entityQueue, [name, data, options]),
        )
        started.push(job)
        void job.catch(retainRejection)
        if (name === ENTITY_LISTENERS_POST_CREATED_JOB.name)
          entityJobs.push({ entityId: (data as { id: string }).id, job })
        return job
      })
      restores.push(() => addSpy.mockRestore())
      const retryReal = retry.retryTransientEnqueue
      const retrySpy = vi
        .spyOn(retry, 'retryTransientEnqueue')
        .mockImplementation(<T,>(fn: () => Promise<T>): Promise<T> => {
          assertOpen()
          const item: ElectionAdmission = { phase, ids: [], jobs: Promise.resolve() }
          const jobs = Promise.resolve().then(() => context.run(item, () => retryReal(fn)))
          item.jobs = jobs
          started.push(jobs)
          void jobs.catch(retainRejection)
          return jobs
        })
      restores.push(() => retrySpy.mockRestore())
      const bulkReal = statsQueue.addBulk
      const bulkSpy = vi.spyOn(statsQueue, 'addBulk').mockImplementation(jobs => {
        assertOpen()
        const item = context.getStore()
        const stats = jobs.filter(job => job.name === VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name)
        if (item && stats.length && !admissions.includes(item)) {
          item.ids = stats.map(job => (job.data as { electionId: string }).electionId)
          admissions.push(item)
        }
        return Reflect.apply(bulkReal, statsQueue, [jobs])
      })
      restores.push(() => bulkSpy.mockRestore())
    },
    votes() {
      phase = 'votes'
    },
    async drain() {
      const errors: unknown[] = []
      // Array iteration retains promises appended by retries or processor fanout during settlement.
      for (; cursor < started.length; cursor++) {
        const promise = started[cursor]!
        const [result] = await Promise.allSettled([promise])
        if (result?.status === 'rejected') errors.push(result.reason)
      }
      return errors
    },
    restore() {
      closing = true
      const errors: unknown[] = []
      for (const restore of restores.toReversed()) {
        try {
          restore()
        } catch (err) {
          errors.push(err)
        }
      }
      return errors
    },
  }
}
function retainRejection(error: unknown) {
  return error
}
