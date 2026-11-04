import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

describe('worker schedule registration', () => {
  it('removes undeclared schedulers through each queue definition', async () => {
    const namespace = BigInt(`0x${randomUUID().replaceAll('-', '')}`).toString()
    const url = new URL(
      process.env.VALKEY_WORKER_QUEUE_URL ?? process.env.VALKEY_URL ?? 'redis://localhost:6379',
    )
    url.pathname = namespace
    vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())

    try {
      const [definitions, emails, embeds, browser, uploads, client, factory, registry] =
        await Promise.all([
          import('./schedule-definitions.mts'),
          import('@queues/emails/queues'),
          import('@queues/crawl-embeds/queues'),
          import('@queues/crawl-browser/queues'),
          import('@queues/image-uploads/queues'),
          import('@data-stores/valkey-core/glide-mq-client'),
          import('@data-stores/valkey-glide-mq'),
          import('@data-stores/valkey-core/glide-mq-registry'),
        ])
      const queues = [
        emails.emails,
        embeds.crawlEmbedsQueue,
        browser.crawlBrowserQueue,
        uploads.imageUploadsQueue,
      ]
      try {
        expect(client.workerQueuePrefix).toBe(`voucha_qdb_${namespace}`)
        const results = await Promise.allSettled(
          queues.map(async queue => {
            const definition = definitions.SCHEDULE_DEFINITIONS.find(
              item => item.queueName === queue.name,
            )
            expect(definition).toBeDefined()
            if (!definition) throw new Error(`Missing ${queue.name} schedule definition`)

            await queue.upsertJobScheduler(
              'obsolete-test-schedule',
              { pattern: '0 * * * *' },
              { name: 'obsoleteTestJob', data: {} },
            )
            expect((await queue.getRepeatableJobs()).map(job => job.name)).toContain(
              'obsolete-test-schedule',
            )

            const registerSchedules = await definition.load()
            await registerSchedules()
            expect(await queue.getRepeatableJobs()).toEqual([])
          }),
        )
        const errors = results.flatMap(result =>
          result.status === 'rejected' ? [result.reason] : [],
        )
        if (errors.length) throw new AggregateError(errors, 'Schedule registration failed')
      } finally {
        try {
          const cleanup =
            client.workerQueuePrefix === `voucha_qdb_${namespace}`
              ? queues.map(queue => queue.obliterate({ force: true }))
              : []
          const results = await Promise.allSettled(cleanup)
          expect(results.filter(result => result.status === 'rejected')).toEqual([])
        } finally {
          try {
            const results = await Promise.allSettled(
              queues.map(queue => factory.closeAndUnregisterGlideMQInstance(queue)),
            )
            expect(results.filter(result => result.status === 'rejected')).toEqual([])
          } finally {
            await registry.closeSharedCommandClientFromRegistry()
          }
        }
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
