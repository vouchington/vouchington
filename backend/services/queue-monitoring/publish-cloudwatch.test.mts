import { describe, expect, it } from 'vitest'
import type { PutMetricDataCommandInput } from '@modules/aws/cloudwatch'
import { policyManagedGlideQueueNames } from '@modules/worker-queue-inventory'
import {
  GLIDE_MQ_QUEUE_NAMES_BY_CLASS,
  GLIDE_MQ_OLDEST_WAITING_AGE_METRIC,
  GLIDE_MQ_WAITING_METRIC,
  publishAggregatedQueueStats,
} from './publish-cloudwatch.mts'

describe('publishAggregatedQueueStats', () => {
  it('partitions every policy-managed GlideMQ queue into exactly one metric class', () => {
    expect(Object.values(GLIDE_MQ_QUEUE_NAMES_BY_CLASS).flat().sort()).toEqual(
      policyManagedGlideQueueNames().sort(),
    )
  })

  it('publishes bounded depth and staleness metrics for each queue class', async () => {
    const timestamp = new Date('2026-08-26T12:00:00.000Z')
    const aggregateCalls: string[][] = []
    let publishedInput: PutMetricDataCommandInput | undefined

    await publishAggregatedQueueStats({
      environment: 'staging',
      timestamp,
      queueNamesByClass: { cpu: ['crawl_urls'], io: ['emails', 'rss-feeds'] },
      getAggregatedQueueMetricStats: async queueNames => {
        aggregateCalls.push([...queueNames])
        return {
          totalWaiting: queueNames.length * 10,
          totalActive: 0,
          totalCompleted: 0,
          totalFailed: 0,
          queueCount: queueNames.length,
          oldestWaitingAgeMs: queueNames.length * 1000,
        }
      },
      putCloudWatchMetricData: async input => {
        publishedInput = input
        return { $metadata: {} }
      },
    })

    expect(aggregateCalls).toEqual([['crawl_urls'], ['emails', 'rss-feeds']])
    expect(publishedInput).toEqual({
      Namespace: 'Voucha/staging',
      MetricData: [
        {
          MetricName: GLIDE_MQ_WAITING_METRIC,
          Dimensions: [{ Name: 'QueueClass', Value: 'cpu' }],
          Unit: 'Count',
          Value: 10,
          Timestamp: timestamp,
        },
        {
          MetricName: GLIDE_MQ_OLDEST_WAITING_AGE_METRIC,
          Dimensions: [{ Name: 'QueueClass', Value: 'cpu' }],
          Unit: 'Seconds',
          Value: 1,
          Timestamp: timestamp,
        },
        {
          MetricName: GLIDE_MQ_WAITING_METRIC,
          Dimensions: [{ Name: 'QueueClass', Value: 'io' }],
          Unit: 'Count',
          Value: 20,
          Timestamp: timestamp,
        },
        {
          MetricName: GLIDE_MQ_OLDEST_WAITING_AGE_METRIC,
          Dimensions: [{ Name: 'QueueClass', Value: 'io' }],
          Unit: 'Seconds',
          Value: 2,
          Timestamp: timestamp,
        },
      ],
    })
  })

  it('does not publish outside deployed environments', async () => {
    let published = false

    await publishAggregatedQueueStats({
      environment: 'development',
      putCloudWatchMetricData: async () => {
        published = true
        return { $metadata: {} }
      },
    })

    expect(published).toBe(false)
  })
})
