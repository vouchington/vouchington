import {
  registerWorkerQueueScriptFile,
  workerQueueCommandClient,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import onError from '@modules/on-error'
import { Queue } from 'glide-mq'
export interface QueueStats {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  paused: boolean
}

type QueueMetricStats = QueueStats & { oldestWaitingAgeMs: number }

const actionablePriorityStatsScript = registerWorkerQueueScriptFile(
  'actionable-priority-stats.lua',
  import.meta.url,
)

// Map of queue name to queue instance
const queueInstances = new Map<string, Queue>()

// Register cleanup on graceful shutdown
addGracefulShutdownCallback(async () => {
  const closurePromises = Array.from(queueInstances.values()).map(queue =>
    queue.close().catch(error => {
      const err = error as Error & { extra?: Record<string, unknown> }
      err.extra = { operation: 'closeQueueInstance', queueName: queue.name }
      onError(err)
    }),
  )
  await Promise.all(closurePromises)
  queueInstances.clear()
})

// Get or create a queue instance
function getQueueInstance(name: string): Queue {
  if (!queueInstances.has(name)) {
    const queue = new Queue(name, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
      client: workerQueueCommandClient,
    })
    queueInstances.set(name, queue)
  }
  return queueInstances.get(name)!
}

async function readQueueStats(name: string, queue: Queue): Promise<QueueStats> {
  const [counts, isPaused] = await Promise.all([queue.getJobCounts(), queue.isPaused()])

  return {
    name,
    waiting: counts.waiting,
    active: counts.active,
    completed: counts.completed,
    failed: counts.failed,
    paused: isPaused,
  }
}

// Get statistics for a single queue
export async function getQueueStats(name: string): Promise<QueueStats> {
  try {
    return await readQueueStats(name, getQueueInstance(name))
  } catch (error) {
    const err = error as Error & { extra?: Record<string, unknown> }
    err.extra = { queueName: name, operation: 'getQueueStats' }
    onError(err)
    throw error
  }
}

async function getQueueMetricStats(name: string): Promise<QueueMetricStats> {
  const queue = getQueueInstance(name)
  try {
    const now = Date.now()
    const scheduledKey = `${workerQueuePrefix ?? 'glide'}:{${name}}:scheduled`
    const [stats, fifoWaitingJobs, queueMetricResult] = await Promise.all([
      readQueueStats(name, queue),
      // Pinned GlideMQ reads its waiting stream with XRANGE - + (oldest-first), an invariant
      // locked by get-queue-stats.real-glide.mock.test.mts. Fetch only one metadata record, and
      // keep this extra read exclusive to the five-minute publisher rather than admin polling.
      queue.getJobs('waiting', 0, 0, { excludeData: true }),
      // Newly enqueued priority jobs share GlideMQ's scheduled ZSet with intentional future delays
      // until the scheduler promotes them. Count due priority score ranges in the datastore so the
      // full actionable depth is retained without materializing scheduled job metadata here.
      workerQueueCommandClient.invokeScript(actionablePriorityStatsScript, {
        keys: [scheduledKey],
        args: [String(now)],
      }),
    ])
    const [waitingCount = stats.waiting, oldestPriorityDueAt = 0] = Array.isArray(queueMetricResult)
      ? queueMetricResult.map(Number)
      : []
    const oldestWaitingAt = Math.min(
      ...fifoWaitingJobs.map(job => job.timestamp),
      ...(oldestPriorityDueAt > 0 ? [oldestPriorityDueAt] : []),
    )
    return {
      ...stats,
      waiting: waitingCount,
      oldestWaitingAgeMs: Number.isFinite(oldestWaitingAt) ? Math.max(0, now - oldestWaitingAt) : 0,
    }
  } catch (error) {
    const err = error as Error & { extra?: Record<string, unknown> }
    err.extra = { queueName: name, operation: 'getQueueMetricStats' }
    onError(err)
    throw error
  }
}

// Get statistics for all queues
export async function getAllQueueStats(queueNames: readonly string[]): Promise<QueueStats[]> {
  const results = await Promise.all(queueNames.map(name => getQueueStats(name)))
  return results.sort((a, b) => a.name.localeCompare(b.name))
}

export interface AggregatedQueueStats {
  totalWaiting: number
  totalActive: number
  totalCompleted: number
  totalFailed: number
  queueCount: number
}

function aggregateQueueStats(stats: readonly QueueStats[]): AggregatedQueueStats {
  return stats.reduce<AggregatedQueueStats>(
    (aggregate, queue) => ({
      totalWaiting: aggregate.totalWaiting + queue.waiting,
      totalActive: aggregate.totalActive + queue.active,
      totalCompleted: aggregate.totalCompleted + queue.completed,
      totalFailed: aggregate.totalFailed + queue.failed,
      queueCount: aggregate.queueCount + 1,
    }),
    { totalWaiting: 0, totalActive: 0, totalCompleted: 0, totalFailed: 0, queueCount: 0 },
  )
}

// Get the inexpensive aggregate used by admin API surfaces.
export async function getAggregatedQueueStats(
  queueNames: readonly string[],
): Promise<AggregatedQueueStats> {
  return aggregateQueueStats(await getAllQueueStats(queueNames))
}

// Get the aggregate plus the staleness signal used only by the periodic CloudWatch publisher.
export async function getAggregatedQueueMetricStats(queueNames: readonly string[]): Promise<
  AggregatedQueueStats & {
    oldestWaitingAgeMs: number
  }
> {
  const stats = await Promise.all(queueNames.map(name => getQueueMetricStats(name)))
  const aggregate = aggregateQueueStats(stats)

  return {
    ...aggregate,
    oldestWaitingAgeMs: Math.max(0, ...stats.map(queue => queue.oldestWaitingAgeMs)),
  }
}
