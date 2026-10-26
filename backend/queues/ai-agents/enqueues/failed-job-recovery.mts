import type { Job } from 'glide-mq'
import type { AIAgentJobData } from '../types.mts'

/** A retained failed job owns any unresolved provider response IDs in its data. */
export function failedAiJobHasNoPendingResponses(job: Job): boolean {
  return ((job.data as AIAgentJobData).backgroundResponses?.length ?? 0) === 0
}
