import { backgroundCpu } from '@queues/background-cpu/queues'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker, type Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { crawlDispatchConfig } from '@services/crawls/work-limits'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processCrawlHostnamesJob } from '../hostnames.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('weekly hostname refresh cap through real GlideMQ', () => {
  it('continues after reaching the per-run row cap', async () => {
    const restoreLimits = overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      weekly_refresh_batch_size: 1,
      weekly_refresh_max_rows_per_run: 2,
    })
    onTestFinished(restoreLimits)

    const firstIdTime = Date.UTC(1970, 0, 1) + 1_000 + parseInt(randomUUID().slice(0, 7), 16)
    const secondHostnameId = getMinUUIDv7ForDate(new Date(firstIdTime + 1))
    const sweepStartedAt = new Date(firstIdTime + 2).toISOString()
    const hostnameIds = await Promise.all(
      [0, 1, 2].map(index =>
        insertTestUrlHostname({
          id: getMinUUIDv7ForDate(new Date(firstIdTime + index)),
          hostname: `weekly-refresh-cap-${randomUUID()}.example.com`,
          is_crawlable: true,
        }),
      ),
    )
    onTestFinished(async () => {
      try {
        await Promise.all(
          hostnameIds.map(hostnameId => updateUrlHostname(hostnameId, { is_crawlable: false })),
        )
      } finally {
        const ownedJobs = await Promise.all(
          hostnameIds.map(hostnameId =>
            backgroundCpu.searchJobs({
              name: 'crawl.refresh_hostname_crawler',
              data: { hostname_id: hostnameId },
            }),
          ),
        )
        await Promise.all(ownedJobs.flat().map(job => job.remove()))
      }
    })

    const prefix = `${workerQueuePrefix}-crawl-refresh-cap-${randomUUID()}`
    const queue = new Queue(BACKGROUND_CPU_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    const events = new QueueEvents(BACKGROUND_CPU_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
      lastEventId: '0',
      blockTimeout: 1_000,
    })
    const worker = new Worker(
      BACKGROUND_CPU_QUEUE_NAME,
      (job: Job) => processCrawlHostnamesJob(job),
      {
        connection: workerQueueConnection,
        prefix,
        concurrency: 1,
        blockTimeout: 1_000,
      },
    )
    let workerToClose: Worker | undefined = worker
    const pausedAtActive = Promise.withResolvers<void>()
    // Pause before the processor defers this job, so its immediate continuation cannot run.
    worker.once('active', () => {
      void worker.pause(true).then(pausedAtActive.resolve, pausedAtActive.reject)
    })

    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
      const delayed = once(events, 'delay-changed')
      const job = await queue.add(
        'crawl.refresh_hostname_crawler_dispatcher',
        {
          cursor: {
            afterId: getMinUUIDv7ForDate(new Date(firstIdTime - 1)),
            sweepStartedAt,
          },
        },
        { attempts: 1 },
      )
      if (!job) throw new Error('Expected the weekly hostname refresh dispatcher job')
      await pausedAtActive.promise
      const [event] = await delayed
      await worker.close()
      workerToClose = undefined

      expect(event).toMatchObject({ jobId: job.id })
      const [firstChildren, secondChildren, thirdChildren] = await Promise.all(
        hostnameIds.map(hostnameId =>
          backgroundCpu.searchJobs({
            name: 'crawl.refresh_hostname_crawler',
            data: { hostname_id: hostnameId },
          }),
        ),
      )
      expect(firstChildren).toHaveLength(1)
      expect(secondChildren).toHaveLength(1)
      expect(thirdChildren).toHaveLength(0)

      const parkedJob = await queue.getJob(job.id)
      expect(await parkedJob?.getState()).toBe('delayed')
      expect(parkedJob?.data.cursor).toMatchObject({ afterId: secondHostnameId, sweepStartedAt })
    } finally {
      await Promise.all([workerToClose?.close(true), events.close()])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
