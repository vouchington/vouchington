import type { Job } from 'glide-mq'
import {
  evaluateSpendCapBreach,
  beginSpendCapDelayedJobRelease,
  completeSpendCapDelayedJobRelease,
  registerSpendCapDelayedJob,
  registerSpendCapDelayedJobAfterFreshBreach,
  refreshDailyAiCostTotalMicrounits,
  reopenSpendCapDelayedJobRegistration,
  releaseSpendCapDelayedJobs,
} from '@services/ai-usage'
import { enqueueSpendCapRecheckBestEffort } from '@queues/ai-agents/enqueues/spend-cap-recheck'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AIAgentJobData, SpendCapRecheckJobData } from '@queues/ai-agents/types'
import { getDayBounds } from '@ts-shared/utils/dates'

const RECHECK_INTERVAL_MS = 60_000
const POST_ROLLOVER_DRAIN_DELAY_MS = 1_000

function getSpendCapRecheckAt(day: string, now = Date.now()): number {
  return Math.min(getDayBounds(day).endMs, now + RECHECK_INTERVAL_MS)
}

/** Register the exact ai_agents job before core parks it at the queried day boundary. */
export async function registerSpendCapRecheck(
  job: Job<AIAgentJobData>,
  day: string,
): Promise<boolean> {
  const registration = await registerSpendCapDelayedJob(job, day)
  if (registration.accepted) {
    const now = Date.now()
    const delayMs = Math.max(0, getSpendCapRecheckAt(day, now) - now)
    await enqueueSpendCapRecheckBestEffort(day, registration.generation, delayMs)
    return true
  }
  const currentBreach = await evaluateSpendCapBreach({
    getDailyAiCostTotalMicrounits: refreshDailyAiCostTotalMicrounits,
  })
  if (currentBreach?.day !== day) {
    await enqueueSpendCapRecheckBestEffort(day, registration.generation, 0)
    return false
  }
  const reopenedRegistration = await registerSpendCapDelayedJobAfterFreshBreach(job, day)
  if (!reopenedRegistration.accepted) {
    throw new Error('Fresh AI spend-cap breach did not reopen delayed-job registration')
  }
  await enqueueSpendCapRecheckBestEffort(day, reopenedRegistration.generation, 0)
  return true
}

export async function processSpendCapRecheckJob(job: Job<SpendCapRecheckJobData>): Promise<void> {
  const { day, generation } = job.data
  const dayEnd = getDayBounds(day).endMs
  const breach = await evaluateSpendCapBreach()
  const breachCheckedAt = Date.now()
  if (breach?.day === day && breachCheckedAt < dayEnd) {
    const reopened = await reopenSpendCapDelayedJobRegistration(day, generation)
    if (!reopened) return
    await job.moveToDelayed(getSpendCapRecheckAt(day, breachCheckedAt))
  }

  const lease = await beginSpendCapDelayedJobRelease(day, generation)
  if (!lease) return
  const drain = await releaseSpendCapDelayedJobs(
    day,
    lease,
    ai_agents,
    job.data.cursor ?? '0',
    Date.now() >= dayEnd,
  )
  if (drain.hasPending) {
    await job.updateData({ ...job.data, cursor: drain.cursor })
    await job.moveToDelayed(Date.now() + POST_ROLLOVER_DRAIN_DELAY_MS)
  }
  const completed = await completeSpendCapDelayedJobRelease(day, generation, lease)
  if (!completed) await job.moveToDelayed(Date.now() + POST_ROLLOVER_DRAIN_DELAY_MS)
}
