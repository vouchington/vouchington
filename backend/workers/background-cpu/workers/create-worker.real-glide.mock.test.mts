import { randomUUID } from 'node:crypto'
import { Queue, UnrecoverableError } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  closeAndUnregisterGlideMQInstance,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundCpuWorker } from './create-worker.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('shared CPU worker paged dispatcher recovery', () => {
  it('retries paged work with its custom backoff while rejecting exhausted ordinary work', async () => {
    const prefix = `${workerQueuePrefix}-cpu-stall-budget-${randomUUID()}`
    const queue = new Queue(BACKGROUND_CPU_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      hostnames_backoff_ms: 1,
    })
    let worker: ReturnType<typeof createBackgroundCpuWorker> | undefined
    try {
      const definition = requireBackgroundCpuJob('crawl.refresh_hostname_crawler')
      const ordinary = await queue.add(definition.name, {}, definition.options)
      const pageDefinition = requireBackgroundCpuJob('crawl.crawl_urls_per_hostname_dispatcher')
      const page = await queue.add(
        pageDefinition.name,
        { hostname_id: 'not-a-uuid' },
        {
          ...pagedDispatchJobOptions('hostnames'),
          attempts: 2,
        },
      )
      if (!ordinary || !page) throw new Error('Expected both CPU jobs to be admitted')
      const client = await queue.getClient()
      await Promise.all(
        [ordinary, page].map(job =>
          client.hset(`${prefix}:{${BACKGROUND_CPU_QUEUE_NAME}}:job:${job.id}`, {
            stalledCount: '3',
          }),
        ),
      )
      const ordinaryFailed = Promise.withResolvers<Error>()
      const pageFailed = Promise.withResolvers<Error>()
      worker = createBackgroundCpuWorker({
        handlers: BACKGROUND_CPU_HANDLERS,
        domains: ['crawl'],
        prefix,
        concurrency: 1,
      })
      worker.on('error', error => {
        ordinaryFailed.reject(error)
        pageFailed.reject(error)
      })
      let pageFailures = 0
      worker.on('failed', (job, error) => {
        if (job?.id === ordinary.id) ordinaryFailed.resolve(error)
        if (job?.id === page.id && ++pageFailures === 2) pageFailed.resolve(error)
      })
      const [ordinaryError, pageError] = await Promise.all([
        ordinaryFailed.promise,
        pageFailed.promise,
      ])
      expect(ordinaryError).toBeInstanceOf(UnrecoverableError)
      expect(pageError).toMatchObject({ code: '22P02' })
      const storedOrdinary = await queue.getJob(ordinary.id)
      const storedPage = await queue.getJob(page.id)
      expect(storedOrdinary?.attemptsMade).toBe(1)
      expect(storedPage?.attemptsMade).toBe(2)
      expect(await storedOrdinary?.getState()).toBe('failed')
      expect(await storedPage?.getState()).toBe('failed')
    } finally {
      if (worker) await closeAndUnregisterGlideMQInstance(worker)
      restore()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
