import { Queue } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { createQueue } from '@data-stores/valkey-glide-mq'
import {
  getAggregatedQueueMetricStats,
  getAllQueueStats,
  getQueueStats,
} from './get-queue-stats.mts'

describe('get-queue-stats', () => {
  it('returns queue stats with correct shape', async () => {
    const name = `test-${crypto.randomUUID()}`
    const result = await getQueueStats(name)
    expect(result).toEqual({
      name,
      waiting: expect.any(Number),
      active: expect.any(Number),
      completed: expect.any(Number),
      failed: expect.any(Number),
      paused: expect.any(Boolean),
    })
  })

  it('returns non-negative counts', async () => {
    const name = `test-${crypto.randomUUID()}`
    const result = await getQueueStats(name)
    expect(result.waiting).toBeGreaterThanOrEqual(0)
    expect(result.active).toBeGreaterThanOrEqual(0)
    expect(result.completed).toBeGreaterThanOrEqual(0)
    expect(result.failed).toBeGreaterThanOrEqual(0)
  })

  it('calling same queue name twice returns consistent results', async () => {
    const name = `test-${crypto.randomUUID()}`
    const result1 = await getQueueStats(name)
    const result2 = await getQueueStats(name)
    expect(result1.name).toBe(result2.name)
    expect(result2.waiting).toBe(result1.waiting)
  })

  it('getAllQueueStats returns stats sorted by queue name', async () => {
    const uuid = crypto.randomUUID()
    const stats = await getAllQueueStats([`z-queue-${uuid}`, `a-queue-${uuid}`])
    expect(stats).toHaveLength(2)
    expect(stats[0].name).toBe(`a-queue-${uuid}`)
    expect(stats[1].name).toBe(`z-queue-${uuid}`)
  })

  it('getAllQueueStats returns correct shape for each queue', async () => {
    const uuid = crypto.randomUUID()
    const stats = await getAllQueueStats([`queue-1-${uuid}`, `queue-2-${uuid}`])
    expect(stats).toHaveLength(2)
    for (const stat of stats) {
      expect(stat).toMatchObject({
        waiting: expect.any(Number),
        active: expect.any(Number),
        completed: expect.any(Number),
        failed: expect.any(Number),
        paused: expect.any(Boolean),
      })
    }
  })

  it('decorates queue-stat read errors with operation context', async () => {
    const name = `stats-error-${crypto.randomUUID()}`
    const error = new Error('stats read failed') as Error & {
      extra?: Record<string, unknown>
    }
    const getJobCounts = vi.spyOn(Queue.prototype, 'getJobCounts').mockRejectedValueOnce(error)
    try {
      await expect(getQueueStats(name)).rejects.toBe(error)
      expect(error.extra).toEqual({ queueName: name, operation: 'getQueueStats' })
    } finally {
      getJobCounts.mockRestore()
    }
  })

  it('decorates queue-metric read errors with operation context', async () => {
    const name = `metric-error-${crypto.randomUUID()}`
    const error = new Error('metric read failed') as Error & {
      extra?: Record<string, unknown>
    }
    const getJobs = vi.spyOn(Queue.prototype, 'getJobs').mockRejectedValueOnce(error)
    try {
      await expect(getAggregatedQueueMetricStats([name])).rejects.toBe(error)
      expect(error.extra).toEqual({ queueName: name, operation: 'getQueueMetricStats' })
    } finally {
      getJobs.mockRestore()
    }
  })

  it('reads oldest waiting-job age only for the metrics aggregate', async () => {
    vi.useFakeTimers()
    const name = `metrics-${crypto.randomUUID()}`
    const queue = createQueue(name)
    try {
      vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'))
      await queue.add('first', {})
      vi.setSystemTime(new Date('2026-08-26T12:01:00.000Z'))
      await queue.add('second', {})
      vi.setSystemTime(new Date('2026-08-26T12:02:00.000Z'))

      await expect(getQueueStats(name)).resolves.not.toHaveProperty('oldestWaitingAgeMs')
      await expect(getAggregatedQueueMetricStats([name])).resolves.toMatchObject({
        oldestWaitingAgeMs: 120_000,
      })
    } finally {
      vi.useRealTimers()
      await queue.close()
    }
  })
})
