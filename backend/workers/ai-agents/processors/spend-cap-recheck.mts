import type { Job } from 'glide-mq'
import {
  evaluateOpenAiSpendCapBreach,
  beginOpenAiSpendCapDelayedJobRelease,
  completeOpenAiSpendCapDelayedJobRelease,
  getDailyAiCostTotalMicrounits,
  getOpenAiSpendCapFields,
  openAiSpendCapConfig,
  registerOpenAiSpendCapDelayedJob,
  registerOpenAiSpendCapDelayedJobAfterFreshBreach,
  refreshDailyAiCostTotalMicrounits,
  reopenOpenAiSpendCapDelayedJobRegistration,
  releaseOpenAiSpendCapDelayedJobs,
} from '@services/ai-usage'
import {
  enqueueOpenAiSpendCapRecheck,
  enqueueOpenAiSpendCapRecheckBestEffort,
} from '@queues/ai-agents/enqueues/spend-cap-recheck'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AIAgentJobData, OpenAiSpendCapRecheckJobData } from '@queues/ai-agents/types'
import { getDayBounds } from '@ts-shared/utils/dates'

const RECHECK_INTERVAL_MS = 60_000
const POST_ROLLOVER_DRAIN_DELAY_MS = 1_000

type RecheckDependencies = {
  waitForOpenAiSpendCapConfig: () => Promise<void>
  getOpenAiSpendCapFields: typeof getOpenAiSpendCapFields
  getDailyAiCostTotalMicrounits: typeof getDailyAiCostTotalMicrounits
  beginOpenAiSpendCapDelayedJobRelease: typeof beginOpenAiSpendCapDelayedJobRelease
  completeOpenAiSpendCapDelayedJobRelease: typeof completeOpenAiSpendCapDelayedJobRelease
  reopenOpenAiSpendCapDelayedJobRegistration: typeof reopenOpenAiSpendCapDelayedJobRegistration
  releaseOpenAiSpendCapDelayedJobs: (
    day: string,
    lease: string,
    cursor: string,
    dayHasEnded: boolean,
  ) => ReturnType<typeof releaseOpenAiSpendCapDelayedJobs>
}

type RegistrationDependencies = {
  registerOpenAiSpendCapDelayedJob: typeof registerOpenAiSpendCapDelayedJob
  registerOpenAiSpendCapDelayedJobAfterFreshBreach: typeof registerOpenAiSpendCapDelayedJobAfterFreshBreach
  enqueueOpenAiSpendCapRecheck: typeof enqueueOpenAiSpendCapRecheck
  evaluateOpenAiSpendCapBreach: typeof evaluateOpenAiSpendCapBreach
  refreshDailyAiCostTotalMicrounits: typeof refreshDailyAiCostTotalMicrounits
}

const defaultRegistrationDependencies: RegistrationDependencies = {
  registerOpenAiSpendCapDelayedJob,
  registerOpenAiSpendCapDelayedJobAfterFreshBreach,
  enqueueOpenAiSpendCapRecheck,
  evaluateOpenAiSpendCapBreach,
  refreshDailyAiCostTotalMicrounits,
}

const defaultDependencies: RecheckDependencies = {
  waitForOpenAiSpendCapConfig: () => openAiSpendCapConfig.waitForInitialization(),
  getOpenAiSpendCapFields,
  getDailyAiCostTotalMicrounits,
  beginOpenAiSpendCapDelayedJobRelease,
  completeOpenAiSpendCapDelayedJobRelease,
  reopenOpenAiSpendCapDelayedJobRegistration,
  releaseOpenAiSpendCapDelayedJobs: (day, lease, cursor, dayHasEnded) =>
    releaseOpenAiSpendCapDelayedJobs(day, lease, ai_agents, undefined, cursor, dayHasEnded),
}

export function getOpenAiSpendCapRecheckAt(day: string, now = Date.now()): number {
  return Math.min(getDayBounds(day).endMs, now + RECHECK_INTERVAL_MS)
}

/** Register the exact ai_agents job before core parks it at the queried day boundary. */
export async function registerOpenAiSpendCapRecheck(
  job: Job<AIAgentJobData>,
  day: string,
  now = Date.now(),
  deps: Partial<RegistrationDependencies> = {},
): Promise<boolean> {
  const dependencies = { ...defaultRegistrationDependencies, ...deps }
  const registration = await dependencies.registerOpenAiSpendCapDelayedJob(job, day)
  if (registration.accepted) {
    const delayMs = Math.max(0, getOpenAiSpendCapRecheckAt(day, now) - now)
    await enqueueOpenAiSpendCapRecheckBestEffort(
      day,
      registration.generation,
      delayMs,
      dependencies.enqueueOpenAiSpendCapRecheck,
    )
    return true
  }
  const currentBreach = await dependencies.evaluateOpenAiSpendCapBreach({
    getDailyAiCostTotalMicrounits: dependencies.refreshDailyAiCostTotalMicrounits,
  })
  if (currentBreach?.day !== day) {
    await enqueueOpenAiSpendCapRecheckBestEffort(
      day,
      registration.generation,
      0,
      dependencies.enqueueOpenAiSpendCapRecheck,
    )
    return false
  }
  const reopenedRegistration = await dependencies.registerOpenAiSpendCapDelayedJobAfterFreshBreach(
    job,
    day,
  )
  if (!reopenedRegistration.accepted) {
    throw new Error('Fresh OpenAI spend-cap breach did not reopen delayed-job registration')
  }
  await enqueueOpenAiSpendCapRecheckBestEffort(
    day,
    reopenedRegistration.generation,
    0,
    dependencies.enqueueOpenAiSpendCapRecheck,
  )
  return true
}

export async function processOpenAiSpendCapRecheckJob(
  job: Job<OpenAiSpendCapRecheckJobData>,
  deps: Partial<RecheckDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...deps }
  const { day, generation } = job.data
  const dayEnd = getDayBounds(day).endMs
  const breach = await evaluateOpenAiSpendCapBreach(dependencies)
  const breachCheckedAt = Date.now()
  if (breach?.day === day && breachCheckedAt < dayEnd) {
    const reopened = await dependencies.reopenOpenAiSpendCapDelayedJobRegistration(day, generation)
    if (!reopened) return
    await job.moveToDelayed(getOpenAiSpendCapRecheckAt(day, breachCheckedAt))
  }

  const lease = await dependencies.beginOpenAiSpendCapDelayedJobRelease(day, generation)
  if (!lease) return
  const drain = await dependencies.releaseOpenAiSpendCapDelayedJobs(
    day,
    lease,
    job.data.cursor ?? '0',
    Date.now() >= dayEnd,
  )
  if (drain.hasPending) {
    await job.updateData({ ...job.data, cursor: drain.cursor })
    await job.moveToDelayed(Date.now() + POST_ROLLOVER_DRAIN_DELAY_MS)
  }
  const completed = await dependencies.completeOpenAiSpendCapDelayedJobRelease(
    day,
    generation,
    lease,
  )
  if (!completed) await job.moveToDelayed(Date.now() + POST_ROLLOVER_DRAIN_DELAY_MS)
}
