import assert from 'http-assert'
import { recordStaffOperation } from '@services/moderator-actions'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanAccessQueueStats } from './authorization.mts'
import { QUEUE_NAMES, findQueueByName } from './queue-inventory.mts'
import {
  getAllQueueStats,
  getAggregatedQueueStats,
} from '@data-stores/valkey-glide-mq/get-queue-stats'
import { SCHEDULED_JOBS_REGISTRY } from './scheduled-jobs-registry.mts'
import { BACKFILL_REGISTRY } from './backfills-registry.mts'

export async function listManagedQueues() {
  const queues = await getAllQueueStats(QUEUE_NAMES)
  return { queues, total: queues.length }
}

export async function getManagedQueueStats(currentUser: PrivateUser) {
  assert(currentUserCanAccessQueueStats(currentUser), 403, 'Forbidden')
  return { stats: await getAggregatedQueueStats(QUEUE_NAMES) }
}

export async function setManagedQueuePaused(
  currentUser: PrivateUser,
  name: string,
  paused: boolean,
) {
  assertOperator(currentUser)
  const queue = requireQueue(name)
  if ((await queue.isPaused()) === paused) return { success: true as const }
  await recordStaffOperation(
    currentUser.id,
    {
      actionType: paused ? 'queue_pause' : 'queue_resume',
      queueName: queue.name,
    },
    () => (paused ? queue.pause() : queue.resume()),
  )
  return { success: true as const }
}

export async function retryManagedQueueFailedJobs(currentUser: PrivateUser, name: string) {
  assertOperator(currentUser)
  const queue = requireQueue(name)
  const result = await recordStaffOperation(
    currentUser.id,
    {
      actionType: 'queue_retry_failed',
      queueName: queue.name,
    },
    async () => {
      const failedJobs = await queue.getJobs('failed', 0, 99)
      const results = await Promise.allSettled(failedJobs.map(job => job.retry()))
      return {
        attempted: results.length,
        retried: results.filter(result => result.status === 'fulfilled').length,
      }
    },
    result => ({ after: result }),
  )
  return { success: true as const, retried: result.retried }
}

export function listManagedScheduledJobs() {
  return { jobs: SCHEDULED_JOBS_REGISTRY.map(({ trigger: _, ...job }) => job) }
}

export async function runManagedScheduledJob(currentUser: PrivateUser, id: string) {
  assertOperator(currentUser)
  const job = SCHEDULED_JOBS_REGISTRY.find(job => job.id === id)
  assert(job, 404, 'Scheduled job not found')
  await recordStaffOperation(
    currentUser.id,
    { actionType: 'scheduled_job_run', scheduledJobKey: job.id },
    async () => job.trigger(),
  )
  return { success: true as const }
}

export function listManagedBackfills() {
  return { backfills: BACKFILL_REGISTRY.map(({ trigger: _, ...backfill }) => backfill) }
}

export async function runManagedBackfill(currentUser: PrivateUser, id: string) {
  assertOperator(currentUser)
  const backfill = BACKFILL_REGISTRY.find(backfill => backfill.id === id)
  assert(backfill, 404, 'Backfill not found')
  await recordStaffOperation(
    currentUser.id,
    { actionType: 'backfill_run', backfillKey: backfill.id },
    () => backfill.trigger(),
  )
  return { success: true as const }
}

function assertOperator(currentUser: PrivateUser): void {
  assert(currentUserCanAccessQueueStats(currentUser), 403, 'Forbidden')
  assertNotSuspended(currentUser)
}
function requireQueue(name: string) {
  const queue = findQueueByName(name)
  assert(queue, 404, 'Queue not found')
  return queue
}
