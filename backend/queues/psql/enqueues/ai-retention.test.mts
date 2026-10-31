import { describe, expect, it, onTestFinished } from 'vitest'
import { PRIORITY_DEFAULT } from '@queues/psql/config'
import { enqueueAIRetentionContinuations } from '@queues/psql/enqueues'
import { psql } from '@queues/psql/queues'
import { AI_RETENTION_FAMILIES } from '@queues/psql/types'

describe('AI retention continuation enqueue', () => {
  it.each(AI_RETENTION_FAMILIES)(
    'admits one deduplicated %s continuation with the family ordering',
    async family => {
      const jobId = `ai_retention_continuation__${family}`
      onTestFinished(async () => {
        await (await psql.getJob(jobId))?.remove()
      })
      await (await psql.getJob(jobId))?.remove()

      const admitted = await enqueueAIRetentionContinuations([family, family])

      expect(admitted.map(job => job.id)).toEqual([jobId])
      const job = await psql.getJob(jobId)
      expect(job?.data).toEqual({ family })
      expect(job?.opts).toMatchObject({
        priority: PRIORITY_DEFAULT,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
        ordering: { key: `psql:ai-retention:${family}`, concurrency: 1 },
      })
    },
  )
})
