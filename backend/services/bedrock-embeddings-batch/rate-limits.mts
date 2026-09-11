import {
  getActiveBatchStats,
  getBatchRecordsCreatedInLastHour,
} from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'
import { getRateLimitConfig } from '@services/bedrock-embeddings/batch/config'

export { getRateLimitConfig } from '@services/bedrock-embeddings/batch/config'

export async function getBatchCreationLimits(): Promise<
  | {
      allowed: true
      maxRecords: number
      maxSizeMB: number
      minRecords: number
    }
  | { allowed: false; reason: string }
> {
  const config = getRateLimitConfig()
  const activeStats = await getActiveBatchStats()
  if (activeStats.count >= config.MAX_INFLIGHT_JOBS) {
    return { allowed: false, reason: 'inflight_job_limit_exceeded' }
  }

  const recordsCreatedLastHour = await getBatchRecordsCreatedInLastHour()
  const remainingRequestsThisHour = config.MAX_REQUESTS_PER_HOUR - recordsCreatedLastHour
  if (remainingRequestsThisHour <= 0) {
    return { allowed: false, reason: 'hourly_request_limit_exceeded' }
  }

  const remainingInflightSizeMB = config.MAX_INFLIGHT_SIZE_MB - activeStats.inputSizeMB
  if (remainingInflightSizeMB <= 0) {
    return { allowed: false, reason: 'inflight_size_limit_exceeded' }
  }

  return {
    allowed: true,
    maxRecords: Math.min(config.MAX_REQUESTS_PER_BATCH, remainingRequestsThisHour),
    maxSizeMB: Math.min(config.MAX_BATCH_SIZE_MB, remainingInflightSizeMB),
    minRecords: config.MIN_RECORDS_PER_JOB,
  }
}
