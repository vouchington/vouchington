import { describe, expect, it, onTestFinished } from 'vitest'
import { PRIORITY_DEFAULT } from '@queues/psql/config'
import { enqueueTerminalActivityRetention } from '@queues/psql/enqueues/activitypub-terminal-retention'
import { psql } from '@queues/psql/queues'

const family = 'like'
const jobId = `psql__terminal_activity_retention__${family}`

describe('terminal activity retention enqueue', () => {
  it('admits the family sweep with its ordering key', async () => {
    onTestFinished(async () => {
      await (await psql.getJob(jobId))?.remove()
    })
    await (await psql.getJob(jobId))?.remove()

    const admitted = await enqueueTerminalActivityRetention([family])

    expect(admitted.map(job => job.id)).toEqual([jobId])
    const job = await psql.getJob(jobId)
    expect(job?.data).toEqual({ family })
    expect(job?.opts).toMatchObject({
      priority: PRIORITY_DEFAULT,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
      ordering: { key: `psql:terminal-activity-retention:${family}`, concurrency: 1 },
    })
  })
})
