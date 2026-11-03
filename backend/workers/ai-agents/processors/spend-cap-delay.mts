import type { Job } from 'glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { getDayBounds } from '@ts-shared/utils/dates'
import onError from '@modules/on-error'
import { registerSpendCapRecheck } from './spend-cap-recheck.mts'

export async function delayForSpendCap(job: Job<AIAgentJobData>, day: string): Promise<void> {
  let parkAtDayBoundary = true
  try {
    parkAtDayBoundary = await registerSpendCapRecheck(job, day)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err), { cause: err }))
  }
  const delayedUntil = parkAtDayBoundary ? getDayBounds(day).endMs : Date.now() + 1_000
  return job.moveToDelayed(delayedUntil)
}
