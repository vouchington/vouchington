import type { Job } from 'glide-mq'
import {
  evaluateSpendCapBreach,
  beginSpendCapDelayedJobRelease,
  completeSpendCapDelayedJobRelease,
  getDailyAiCostTotalMicrounits,
  getSpendCapFields,
  spendCapConfig,
  registerSpendCapDelayedJob,
  registerSpendCapDelayedJobAfterFreshBreach,
  refreshDailyAiCostTotalMicrounits,
  reopenSpendCapDelayedJobRegistration,
  releaseSpendCapDelayedJobs,
} from '@services/ai-usage'
import {
  enqueueSpendCapRecheck,
  enqueueSpendCapRecheckBestEffort,
} from '@queues/ai-agents/enqueues/spend-cap-recheck'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AIAgentJobData, SpendCapRecheckJobData } from '@queues/ai-agents/types'
import { getDayBounds } from '@ts-shared/utils/dates'

const RECHECK_INTERVAL_MS = 60_000
const POST_ROLLOVER_DRAIN_DELAY_MS = 1_000

type RecheckDependencies = {
  waitForSpendCapConfig: () => Promise<void>
  getSpendCapFields: typeof getSpendCapFields
  getDailyAiCostTotalMicrounits: typeof getDailyAiCostTotalMicrounits
  beginSpendCapDelayedJobRelease: typeof beginSpendCapDelayedJobRelease
  completeSpendCapDelayedJobRelease: typeof completeSpendCapDelayedJobRelease
  reopenSpendCapDelayedJobRegistration: typeof reopenSpendCapDelayedJobRegistration
  releaseSpendCapDelayedJobs: (
    day: string,
    lease: string,
    cursor: string,
    dayHasEnded: boolean,
  ) => ReturnType<typeof releaseSpendCapDelayedJobs>
}

type RegistrationDependencies = {
  registerSpendCapDelayedJob: typeof registerSpendCapDelayedJob
  registerSpendCapDelayedJobAfterFreshBreach: typeof registerSpendCapDelayedJobAfterFreshBreach
  enqueueSpendCapRecheck: typeof enqueueSpendCapRecheck
  evaluateSpendCapBreach: typeof evaluateSpendCapBreach
  refreshDailyAiCostTotalMicrounits: typeof refreshDailyAiCostTotalMicrounits
}

const defaultRegistrationDependencies: RegistrationDependencies = {
  registerSpendCapDelayedJob,
  registerSpendCapDelayedJobAfterFreshBreach,
  enqueueSpendCapRecheck,
  evaluateSpendCapBreach,
  refreshDailyAiCostTotalMicrounits,
}

const defaultDependencies: RecheckDependencies = {
  waitForSpendCapConfig: () => spendCapConfig.waitForInitialization(),
  getSpendCapFields,
  getDailyAiCostTotalMicrounits,
  beginSpendCapDelayedJobRelease,
  completeSpendCapDelayedJobRelease,
  reopenSpendCapDelayedJobRegistration,
  releaseSpendCapDelayedJobs: (day, lease, cursor, dayHasEnded) =>
    releaseSpendCapDelayedJobs(day, lease, ai_agents, undefined, cursor, dayHasEnded),
}

function getSpendCapRecheckAt(day: string, now = Date.now()): number {
  return Math.min(getDayBounds(day).endMs, now + RECHECK_INTERVAL_MS)
}

/** Register the exact ai_agents job before core parks it at the queried day boundary. */
export async function registerSpendCapRecheck(
  job: Job<AIAgentJobData>,
  day: string,
  now = Date.now(),
  deps: Partial<RegistrationDependencies> = {},
): Promise<boolean> {
  const dependencies = { ...defaultRegistrationDependencies, ...deps }
  const registration = await dependencies.registerSpendCapDelayedJob(job, day)
  if (registration.accepted) {
    const delayMs = Math.max(0, getSpendCapRecheckAt(day, now) - now)
    await enqueueSpendCapRecheckBestEffort(
      day,
      registration.generation,
      delayMs,
      dependencies.enqueueSpendCapRecheck,
    )
    return true
  }
  const currentBreach = await dependencies.evaluateSpendCapBreach({
    getDailyAiCostTotalMicrounits: dependencies.refreshDailyAiCostTotalMicrounits,
  })
  if (currentBreach?.day !== day) {
    await enqueueSpendCapRecheckBestEffort(
      day,
      registration.generation,
      0,
      dependencies.enqueueSpendCapRecheck,
    )
    return false
  }
  const reopenedRegistration = await dependencies.registerSpendCapDelayedJobAfterFreshBreach(
    job,
    day,
  )
  if (!reopenedRegistration.accepted) {
    throw new Error('Fresh AI spend-cap breach did not reopen delayed-job registration')
  }
  await enqueueSpendCapRecheckBestEffort(
    day,
    reopenedRegistration.generation,
    0,
    dependencies.enqueueSpendCapRecheck,
  )
  return true
}

export async function processSpendCapRecheckJob(
  job: Job<SpendCapRecheckJobData>,
  deps: Partial<RecheckDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...deps }
  const { day, generation } = job.data
  const dayEnd = getDayBounds(day).endMs
  const breach = await evaluateSpendCapBreach(dependencies)
  const breachCheckedAt = Date.now()
  if (breach?.day === day && breachCheckedAt < dayEnd) {
    const reopened = await dependencies.reopenSpendCapDelayedJobRegistration(day, generation)
    if (!reopened) return
    await job.moveToDelayed(getSpendCapRecheckAt(day, breachCheckedAt))
  }

  const lease = await dependencies.beginSpendCapDelayedJobRelease(day, generation)
  if (!lease) return
  const drain = await dependencies.releaseSpendCapDelayedJobs(
    day,
    lease,
    job.data.cursor ?? '0',
    Date.now() >= dayEnd,
  )
  if (drain.hasPending) {
    await job.updateData({ ...job.data, cursor: drain.cursor })
    await job.moveToDelayed(Date.now() + POST_ROLLOVER_DRAIN_DELAY_MS)
  }
  const completed = await dependencies.completeSpendCapDelayedJobRelease(day, generation, lease)
  if (!completed) await job.moveToDelayed(Date.now() + POST_ROLLOVER_DRAIN_DELAY_MS)
}
