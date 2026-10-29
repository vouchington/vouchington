import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Queue } from 'glide-mq'
import type { PutMetricDataCommandInput, PutMetricDataCommandOutput } from '@modules/aws/cloudwatch'
import { workerQueuePolicySource } from '@modules/worker-queue-inventory'
import { policyManagedGlideQueueNames } from '@voucha/test-helpers/worker-queue-policy'
import * as queueStats from '@data-stores/valkey-glide-mq/get-queue-stats'
import { publishAggregatedQueueStats } from './publish-cloudwatch.mts'

const { putCloudWatchMetricData } = vi.hoisted(() => ({
  putCloudWatchMetricData:
    vi.fn<(input: PutMetricDataCommandInput) => Promise<PutMetricDataCommandOutput>>(),
}))

vi.mock<typeof import('@modules/aws/cloudwatch')>(
  import('@modules/aws/cloudwatch'),
  async importOriginal => ({
    ...(await importOriginal()),
    putCloudWatchMetricData,
  }),
)

describe('publishAggregatedQueueStats through real GlideMQ', () => {
  beforeEach(() => {
    putCloudWatchMetricData.mockReset()
    putCloudWatchMetricData.mockResolvedValue({ $metadata: {} })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(['staging', 'production'] as const)(
    'publishes the four bounded queue metrics in %s',
    async environment => {
      vi.stubEnv('ENVIRONMENT', environment)
      const getJobCounts = vi.spyOn(Queue.prototype, 'getJobCounts')
      const aggregateStats = vi.spyOn(queueStats, 'getAggregatedQueueMetricStats')

      await publishAggregatedQueueStats()

      const input = putCloudWatchMetricData.mock.calls.at(-1)?.[0]
      if (!input) throw new Error('Expected CloudWatch metric data to be published')
      expect(input.Namespace).toBe(`Voucha/${environment}`)
      const metrics = input.MetricData ?? []
      expect(metrics).toHaveLength(4)
      const metricContracts = metrics
        .map(metric => ({
          metricName: metric.MetricName,
          queueClass: metric.Dimensions?.find(dimension => dimension.Name === 'QueueClass')?.Value,
          unit: metric.Unit,
        }))
        .toSorted((left, right) =>
          `${left.queueClass}:${left.metricName}`.localeCompare(
            `${right.queueClass}:${right.metricName}`,
          ),
        )
      expect(metricContracts).toEqual([
        { metricName: 'GlideMQOldestWaitingAge', queueClass: 'cpu', unit: 'Seconds' },
        { metricName: 'GlideMQWaiting', queueClass: 'cpu', unit: 'Count' },
        { metricName: 'GlideMQOldestWaitingAge', queueClass: 'io', unit: 'Seconds' },
        { metricName: 'GlideMQWaiting', queueClass: 'io', unit: 'Count' },
      ])

      const cpuQueueNames = new Set(workerQueuePolicySource.cpuOnlyQueues)
      expect(aggregateStats.mock.calls.flatMap(([queueNames]) => queueNames).toSorted()).toEqual(
        policyManagedGlideQueueNames().toSorted(),
      )
      const aggregatesByClass = new Map(
        await Promise.all(
          aggregateStats.mock.results.map(async (result, index) => {
            if (result.type !== 'return') {
              throw new Error('Expected queue metric aggregation to return a result')
            }
            const queueNames = aggregateStats.mock.calls[index]?.[0]
            if (!queueNames?.length) throw new Error('Expected a nonempty queue class')
            const queueClass = queueNames.every(queueName => cpuQueueNames.has(queueName))
              ? 'cpu'
              : 'io'
            return [queueClass, await result.value] as const
          }),
        ),
      )
      for (const metric of metrics) {
        const queueClass = metric.Dimensions?.find(
          dimension => dimension.Name === 'QueueClass',
        )?.Value
        expect(metric.Dimensions).toEqual([{ Name: 'QueueClass', Value: queueClass }])
        const aggregate = queueClass ? aggregatesByClass.get(queueClass as 'cpu' | 'io') : undefined
        if (!aggregate) throw new Error(`Missing observed ${queueClass ?? 'unknown'} queue stats`)
        const expectedValue =
          metric.MetricName === 'GlideMQWaiting'
            ? aggregate.totalWaiting
            : aggregate.oldestWaitingAgeMs / 1000
        expect(metric.Value).toBe(expectedValue)
        expect(typeof metric.Value).toBe('number')
        expect(Number.isFinite(metric.Value)).toBe(true)
        expect(metric.Value).toBeGreaterThanOrEqual(0)
      }

      const observedQueueNames = [...new Set(getJobCounts.mock.contexts)]
        .map(queue => (queue as Queue).name)
        .toSorted()
      expect(observedQueueNames).toEqual(policyManagedGlideQueueNames().toSorted())
    },
  )

  it.each(['development', 'test'] as const)(
    'does not aggregate or publish outside deployed environments (%s)',
    async environment => {
      vi.stubEnv('ENVIRONMENT', environment)
      const aggregateStats = vi.spyOn(queueStats, 'getAggregatedQueueMetricStats')

      await publishAggregatedQueueStats()

      expect(aggregateStats).not.toHaveBeenCalled()
      expect(putCloudWatchMetricData).not.toHaveBeenCalled()
    },
  )
})
