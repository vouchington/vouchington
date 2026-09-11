import { randomUUID } from 'node:crypto'
import { Queue } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueCommandClient,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { getAggregatedQueueMetricStats } from './get-queue-stats.mts'

vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('queue metric ordering through real GlideMQ', () => {
  it('returns waiting jobs oldest-first so the bounded metric read selects the oldest job', async () => {
    const queueName = `queue_metric_ordering_${randomUUID()}`
    const queue = new Queue<Record<string, never>>(queueName, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })

    try {
      const first = await queue.add('first', {})
      const second = await queue.add('second', {})
      if (!first || !second) throw new Error('Expected waiting metric test jobs to be created')

      const waiting = await queue.getJobs('waiting', 0, 1, { excludeData: true })

      expect(waiting.map(job => job.id)).toEqual([first.id, second.id])
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('includes prioritized jobs after their intentional delay becomes due', async () => {
    const queueName = `queue_metric_priority_${randomUUID()}`
    const queueKey = `${workerQueuePrefix ?? 'glide'}:{${queueName}}`
    const scheduledKey = `${queueKey}:scheduled`
    const jobId = randomUUID()
    const jobKey = `${queueKey}:job:${jobId}`
    const queue = new Queue<Record<string, never>>(queueName, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })

    try {
      const now = Date.now()
      const delay = 60 * 60 * 1000
      const dueAt = now - 100
      const timestamp = dueAt - delay
      await Promise.all([
        workerQueueCommandClient.zadd(scheduledKey, {
          [jobId]: 4_398_046_511_104 + dueAt,
        }),
        workerQueueCommandClient.hset(jobKey, {
          timestamp: String(timestamp),
          delay: String(delay),
        }),
      ])
      const stats = await getAggregatedQueueMetricStats([queueName])

      expect(stats.totalWaiting).toBe(1)
      expect(stats.oldestWaitingAgeMs).toBeGreaterThanOrEqual(100)
      expect(stats.oldestWaitingAgeMs).toBeLessThan(1000)
    } finally {
      await workerQueueCommandClient.unlink([scheduledKey, jobKey])
      await queue.close()
    }
  })

  it('counts the complete actionable priority backlog without returning job metadata', async () => {
    const queueName = `queue_metric_priority_depth_${randomUUID()}`
    const queueKey = `${workerQueuePrefix ?? 'glide'}:{${queueName}}`
    const scheduledKey = `${queueKey}:scheduled`
    const jobIds = Array.from({ length: 125 }, () => randomUUID())
    const futureJobId = randomUUID()
    const queue = new Queue<Record<string, never>>(queueName, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })

    try {
      const now = Date.now()
      await workerQueueCommandClient.zadd(
        scheduledKey,
        Object.fromEntries([
          ...jobIds.map(jobId => [jobId, 4_398_046_511_104 + now] as const),
          [futureJobId, 4_398_046_511_104 + now + 60 * 60 * 1000],
        ]),
      )

      await expect(getAggregatedQueueMetricStats([queueName])).resolves.toMatchObject({
        totalWaiting: 125,
      })
    } finally {
      await workerQueueCommandClient.unlink([scheduledKey])
      await queue.close()
    }
  })
})
