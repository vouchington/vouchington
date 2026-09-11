import type { Job } from 'glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { getDayBounds } from '@ts-shared/utils/dates'
import type { registerOpenAiSpendCapRecheck } from './spend-cap-recheck.mts'

export async function delayForOpenAiSpendCap(
  job: Job<AIAgentJobData>,
  day: string,
  register: typeof registerOpenAiSpendCapRecheck,
  reportRegistrationFailure: (error: Error) => void,
): Promise<void> {
  let parkAtDayBoundary = true
  try {
    parkAtDayBoundary = await register(job, day)
  } catch (error) {
    reportRegistrationFailure(
      error instanceof Error ? error : new Error(String(error), { cause: error }),
    )
  }
  const delayedUntil = parkAtDayBoundary ? getDayBounds(day).endMs : Date.now() + 1_000
  return job.moveToDelayed(delayedUntil)
}
