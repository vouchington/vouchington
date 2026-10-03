import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { registerWorkerQueueScriptFile } from './glide-mq-scripts.mts'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import onError from '@modules/on-error'
import { Queue } from 'glide-mq'
export interface QueueStats {
  name: string
  waiting: number
  active: number
  delayed: number
  completed: number
  failed: number
  paused: boolean
}

// The metric path folds due priority jobs from the scheduled ZSet into `waiting`, and `delayed` is
// that whole ZSet, so it has no `delayed` of its own: one job must not count in two buckets.
type QueueMetricStats = Omit<QueueStats, 'delayed'> & { oldestWaitingAgeMs: number }

const actionablePriorityStatsScript = registerWorkerQueueScriptFile(
  'actionable-priority-stats.lua',
  import.meta.url,
)

// Map of queue name to queue instance
const queueInstances = new Map<string, Queue>()

// Register cleanup on graceful shutdown
addGracefulShutdownCallback(async () => {
  const closurePromises = Array.from(queueInstances.values()).map(queue =>
    queue.close().catch(err => {
      const localErr = err as Error & { extra?: Record<string, unknown> }
      localErr.extra = { operation: 'closeQueueInstance', queueName: queue.name }
      onError(localErr)
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

// `delayed` is glide-mq's scheduled ZSet size, which `getJobCounts()` already reads, so it adds no
// command. `waiting` excludes the ZSet, so `waiting + active + delayed` is the unfinished backlog.
async function readQueueStats(name: string, queue: Queue): Promise<QueueStats> {
  const [counts, isPaused] = await Promise.all([queue.getJobCounts(), queue.isPaused()])

  return {
    name,
    waiting: counts.waiting,
    active: counts.active,
    delayed: counts.delayed,
    completed: counts.completed,
    failed: counts.failed,
    paused: isPaused,
  }
}

// Get statistics for a single queue
export async function getQueueStats(name: string): Promise<QueueStats> {
  try {
    return await readQueueStats(name, getQueueInstance(name))
  } catch (err) {
    const localErr = err as Error & { extra?: Record<string, unknown> }
    localErr.extra = { queueName: name, operation: 'getQueueStats' }
    onError(localErr)
    throw err
  }
}

// Unfinished work on one queue, for backlog guards. GlideMQ parks a freshly enqueued priority job
// in its scheduled ZSet until the scheduler promotes it (about every 5s), and `delayed` is that
// ZSet's size. Reading `waiting + active` alone is blind to every priority job enqueued since the
// last promotion. The ZSet also holds backoff retries, which are still pending work.
export async function getQueueBacklogDepth(name: string): Promise<number> {
  try {
    const counts = await getQueueInstance(name).getJobCounts()
    return counts.waiting + counts.active + counts.delayed
  } catch (err) {
    const localErr = err as Error & { extra?: Record<string, unknown> }
    localErr.extra = { queueName: name, operation: 'getQueueBacklogDepth' }
    onError(localErr)
    throw err
  }
}

async function getQueueMetricStats(name: string): Promise<QueueMetricStats> {
  const queue = getQueueInstance(name)
  try {
    const now = Date.now()
    const scheduledKey = `${workerQueuePrefix ?? 'glide'}:{${name}}:scheduled`
    const [{ delayed: _scheduled, ...stats }, fifoWaitingJobs, queueMetricResult] =
      await Promise.all([
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
  } catch (err) {
    const localErr = err as Error & { extra?: Record<string, unknown> }
    localErr.extra = { queueName: name, operation: 'getQueueMetricStats' }
    onError(localErr)
    throw err
  }
}

// Get statistics for all queues
export async function getAllQueueStats(queueNames: readonly string[]): Promise<QueueStats[]> {
  const results = await Promise.all(queueNames.map(name => getQueueStats(name)))
  return results.toSorted((a, b) => a.name.localeCompare(b.name))
}

export interface AggregatedQueueStats {
  totalWaiting: number
  totalActive: number
  totalDelayed: number
  totalCompleted: number
  totalFailed: number
  queueCount: number
}

type MetricAggregate = Omit<AggregatedQueueStats, 'totalDelayed'>

function sumActionableQueueStats(stats: readonly Omit<QueueStats, 'delayed'>[]): MetricAggregate {
  return stats.reduce<MetricAggregate>(
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

export function aggregateQueueStats(stats: readonly QueueStats[]): AggregatedQueueStats {
  return {
    ...sumActionableQueueStats(stats),
    totalDelayed: stats.reduce((total, queue) => total + queue.delayed, 0),
  }
}

// Get the inexpensive aggregate used by admin API surfaces.
export async function getAggregatedQueueStats(
  queueNames: readonly string[],
): Promise<AggregatedQueueStats> {
  return aggregateQueueStats(await getAllQueueStats(queueNames))
}

// Get the aggregate plus the staleness signal used only by the periodic CloudWatch publisher. Its
// `totalWaiting` already holds due priority jobs, so it reports no `totalDelayed`.
export async function getAggregatedQueueMetricStats(queueNames: readonly string[]): Promise<
  MetricAggregate & {
    oldestWaitingAgeMs: number
  }
> {
  const stats = await Promise.all(queueNames.map(name => getQueueMetricStats(name)))

  return {
    ...sumActionableQueueStats(stats),
    oldestWaitingAgeMs: Math.max(0, ...stats.map(queue => queue.oldestWaitingAgeMs)),
  }
}
