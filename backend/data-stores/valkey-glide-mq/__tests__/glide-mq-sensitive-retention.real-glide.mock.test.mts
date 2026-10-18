import { describe, expect, it, vi } from 'vitest'
import type { Queue } from 'glide-mq'
import {
  workerQueueConnection,
  workerQueuePrefix,
  createBulkEnqueueFunction,
  createEnqueueFunction,
} from '@data-stores/valkey-glide-mq'
import { startRealGlideJobLifecycle } from '@voucha/test-helpers/real-glide-job-lifecycle'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const trackJobEnqueue = vi.fn<typeof import('@data-stores/analytics/queue').trackJobEnqueue>()

describe('sensitive enqueue retention through real GlideMQ', () => {
  it.each([
    ['single', 'complete', 'completed'],
    ['single', 'fail', 'failed'],
    ['bulk', 'complete', 'completed'],
  ] as const)(
    'removes a sensitive %s enqueue after it %ss',
    async (kind, outcome, terminalState) => {
      const lifecycle = await startRealGlideJobLifecycle<Record<string, unknown>>(
        'sensitive_payload',
        connection,
      )
      try {
        lifecycle.setOutcome(outcome)
        const queue = Object.assign(lifecycle.queue, { priorityKind: 'none' as const })
        const result =
          kind === 'single'
            ? await createEnqueueFunction<{ nested: { token: string } }, 'sensitive'>({
                queue: queue as Queue & { priorityKind: 'none' },
                queueName: lifecycle.queue.name,
                jobName: 'sensitive',
                defaults: { attempts: 1, priority: 0 },
                sensitive: true,
                retry: false,
                trackJobEnqueue,
              })({ nested: { token: 'test-token' } })
            : await createBulkEnqueueFunction({
                queue: queue as Queue & { priorityKind: 'none' },
                queueName: lifecycle.queue.name,
                jobName: 'sensitive',
                defaults: { attempts: 1, priority: 0 },
                sensitive: true,
                retry: false,
                trackJobEnqueue,
                buildJob: (email: string) => ({
                  data: { nested: { email } },
                  opts: { priority: 0 },
                }),
              })(['tests+3274@voucha.ai'])

        const job = Array.isArray(result) ? result[0] : result

        if (!job) throw new Error('Expected a sensitive job to be created')
        await expect(lifecycle.settled(job)).resolves.toBe(terminalState)
        await expect(lifecycle.queue.getJob(job.id)).resolves.toBeNull()
        await expect(
          lifecycle.queue.searchJobs({ name: 'sensitive', state: terminalState }),
        ).resolves.toEqual([])
      } finally {
        await lifecycle.close()
      }
    },
  )
})
