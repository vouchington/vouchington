import { describe, expect, it, onTestFinished } from 'vitest'
import { enqueueTerminalActivityRetention } from '@queues/psql/enqueues/activitypub-terminal-retention'
import { psql } from '@queues/psql/queues'
import type { TerminalActivityRetentionData } from '@queues/psql/types'

const terminalFamilies = {
  follow: 'follow',
  like: 'like',
} as const satisfies Record<
  TerminalActivityRetentionData['family'],
  TerminalActivityRetentionData['family']
>

describe('terminal activity retention enqueue', () => {
  it.each(Object.values(terminalFamilies))(
    'admits the %s sweep with its ordering key',
    async family => {
      const jobId = `psql__terminal_activity_retention__${family}`
      onTestFinished(async () => {
        const existing = await psql.getJob(jobId)
        if (existing) await existing.remove()
      })
      const existing = await psql.getJob(jobId)
      if (existing) await existing.remove()

      const admitted = await enqueueTerminalActivityRetention([family])

      expect(admitted.map(job => job.id)).toEqual([jobId])
      const job = await psql.getJob(jobId)
      if (!job) throw new Error(`missing terminal retention job for ${family}`)
      expect(job.data).toEqual({ family })
      expect(job.opts).toMatchObject({
        priority: 10,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
        ordering: { key: `psql:terminal-activity-retention:${family}`, concurrency: 1 },
      })
    },
  )
})
