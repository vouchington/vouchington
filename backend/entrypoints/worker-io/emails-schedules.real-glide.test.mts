import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

describe('emails schedule registration', () => {
  it('removes an undeclared scheduler through the worker definition', async () => {
    const namespace = BigInt(`0x${randomUUID().replaceAll('-', '')}`).toString()
    const url = new URL(
      process.env.VALKEY_WORKER_QUEUE_URL ?? process.env.VALKEY_URL ?? 'redis://localhost:6379',
    )
    url.pathname = namespace
    vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())

    try {
      const [{ SCHEDULE_DEFINITIONS }, { emails }, { workerQueuePrefix }, factory, registry] =
        await Promise.all([
          import('./definitions.mts'),
          import('@queues/emails/queues'),
          import('@data-stores/valkey-core/glide-mq-client'),
          import('@data-stores/valkey-glide-mq'),
          import('@data-stores/valkey-core/glide-mq-registry'),
        ])
      try {
        expect(workerQueuePrefix).toBe(`voucha_qdb_${namespace}`)
        const definition = SCHEDULE_DEFINITIONS.find(item => item.queueName === 'emails')
        expect(definition).toBeDefined()
        if (!definition) throw new Error('Missing emails schedule definition')

        await emails.upsertJobScheduler(
          'obsolete-test-schedule',
          { pattern: '0 * * * *' },
          {
            name: 'obsoleteTestJob',
            data: {},
          },
        )
        expect((await emails.getRepeatableJobs()).map(job => job.name)).toContain(
          'obsolete-test-schedule',
        )

        const registerSchedules = await definition.load()
        await registerSchedules()
        expect(await emails.getRepeatableJobs()).toEqual([])
      } finally {
        try {
          if (workerQueuePrefix === `voucha_qdb_${namespace}`) {
            await emails.obliterate({ force: true })
          }
        } finally {
          try {
            await factory.closeAndUnregisterGlideMQInstance(emails)
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
