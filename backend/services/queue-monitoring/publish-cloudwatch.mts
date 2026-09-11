import { getDeployEnvironment, type DeployEnvironment } from '@ts-shared/deploy-environment'
import { putCloudWatchMetricData } from '@modules/aws/cloudwatch'
import { workerQueuePolicySource } from '@modules/worker-queue-inventory'
import { getAggregatedQueueMetricStats } from './get-queue-stats.mts'

export const GLIDE_MQ_METRIC_NAMESPACE = 'Voucha'
export const GLIDE_MQ_WAITING_METRIC = 'GlideMQWaiting'
export const GLIDE_MQ_OLDEST_WAITING_AGE_METRIC = 'GlideMQOldestWaitingAge'

export type GlideMqQueueClass = 'cpu' | 'io'

// SQS ingress queues have native AWS/SQS metrics and are not GlideMQ queues. Keep them out of
// this publisher so this aggregate remains bounded to two QueueClass dimensions and four active
// CloudWatch series per environment.
export const GLIDE_MQ_QUEUE_NAMES_BY_CLASS: Record<GlideMqQueueClass, readonly string[]> = {
  cpu: workerQueuePolicySource.cpuOnlyQueues,
  io: workerQueuePolicySource.ioCapableQueues.filter(
    queueName => !workerQueuePolicySource.sqsConsumerQueues.includes(queueName),
  ),
}

type PublishOptions = {
  environment?: DeployEnvironment
  queueNamesByClass?: Record<GlideMqQueueClass, readonly string[]>
  timestamp?: Date
  getAggregatedQueueMetricStats?: typeof getAggregatedQueueMetricStats
  putCloudWatchMetricData?: typeof putCloudWatchMetricData
}

/**
 * Publish the two operational GlideMQ signals per queue class.
 *
 * The namespace contains the deploy environment, while QueueClass is the only dimension. This
 * deliberately avoids one CloudWatch time series per queue (and the corresponding Grafana active
 * series growth) while retaining enough depth and staleness information to guide an operator.
 * Local/test environments are no-ops because they do not have an AWS metrics contract.
 */
export async function publishAggregatedQueueStats(options: PublishOptions = {}): Promise<void> {
  const environment = options.environment ?? getDeployEnvironment()
  if (environment !== 'staging' && environment !== 'production') return

  const queueNamesByClass = options.queueNamesByClass ?? GLIDE_MQ_QUEUE_NAMES_BY_CLASS
  const aggregateQueueStats = options.getAggregatedQueueMetricStats ?? getAggregatedQueueMetricStats
  const putMetrics = options.putCloudWatchMetricData ?? putCloudWatchMetricData
  const aggregates = await Promise.all(
    (Object.keys(queueNamesByClass) as GlideMqQueueClass[]).map(async queueClass => ({
      queueClass,
      stats: await aggregateQueueStats(queueNamesByClass[queueClass]),
    })),
  )

  await putMetrics({
    Namespace: `${GLIDE_MQ_METRIC_NAMESPACE}/${environment}`,
    MetricData: aggregates.flatMap(({ queueClass, stats }) => [
      {
        MetricName: GLIDE_MQ_WAITING_METRIC,
        Dimensions: [{ Name: 'QueueClass', Value: queueClass }],
        Unit: 'Count',
        Value: stats.totalWaiting,
        Timestamp: options.timestamp,
      },
      {
        MetricName: GLIDE_MQ_OLDEST_WAITING_AGE_METRIC,
        Dimensions: [{ Name: 'QueueClass', Value: queueClass }],
        Unit: 'Seconds',
        Value: stats.oldestWaitingAgeMs / 1000,
        Timestamp: options.timestamp,
      },
    ]),
  })
}
