import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { putCloudWatchMetricData } from '@modules/aws/cloudwatch'
import { workerQueuePolicySource } from '@modules/worker-queue-inventory'
import { getAggregatedQueueMetricStats } from '@data-stores/valkey-glide-mq/get-queue-stats'

const GLIDE_MQ_METRIC_NAMESPACE = 'Voucha'
const GLIDE_MQ_WAITING_METRIC = 'GlideMQWaiting'
const GLIDE_MQ_OLDEST_WAITING_AGE_METRIC = 'GlideMQOldestWaitingAge'

type GlideMqQueueClass = 'cpu' | 'io'

// SQS ingress queues have native AWS/SQS metrics and are not GlideMQ queues. Keep them out of
// this publisher so this aggregate remains bounded to two QueueClass dimensions and four active
// CloudWatch series per environment.
const GLIDE_MQ_QUEUE_NAMES_BY_CLASS: Record<GlideMqQueueClass, readonly string[]> = {
  cpu: workerQueuePolicySource.cpuOnlyQueues,
  io: workerQueuePolicySource.ioCapableQueues.filter(
    queueName => !workerQueuePolicySource.sqsConsumerQueues.includes(queueName),
  ),
}

/**
 * Publish the two operational GlideMQ signals per queue class.
 *
 * The namespace contains the deploy environment, while QueueClass is the only dimension. This
 * deliberately avoids one CloudWatch time series per queue (and the corresponding Grafana active
 * series growth) while retaining enough depth and staleness information to guide an operator.
 * Local/test environments are no-ops because they do not have an AWS metrics contract.
 */
export async function publishAggregatedQueueStats(): Promise<void> {
  const environment = getDeployEnvironment()
  if (environment !== 'staging' && environment !== 'production') return

  const aggregates = await Promise.all(
    (Object.keys(GLIDE_MQ_QUEUE_NAMES_BY_CLASS) as GlideMqQueueClass[]).map(async queueClass => ({
      queueClass,
      stats: await getAggregatedQueueMetricStats(GLIDE_MQ_QUEUE_NAMES_BY_CLASS[queueClass]),
    })),
  )

  await putCloudWatchMetricData({
    Namespace: `${GLIDE_MQ_METRIC_NAMESPACE}/${environment}`,
    MetricData: aggregates.flatMap(({ queueClass, stats }) => [
      {
        MetricName: GLIDE_MQ_WAITING_METRIC,
        Dimensions: [{ Name: 'QueueClass', Value: queueClass }],
        Unit: 'Count',
        Value: stats.totalWaiting,
      },
      {
        MetricName: GLIDE_MQ_OLDEST_WAITING_AGE_METRIC,
        Dimensions: [{ Name: 'QueueClass', Value: queueClass }],
        Unit: 'Seconds',
        Value: stats.oldestWaitingAgeMs / 1000,
      },
    ]),
  })
}
