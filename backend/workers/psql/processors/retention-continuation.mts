import type { Job } from 'glide-mq'
import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { cleanupAIRetentionFamily } from '@services/data-retention'
import { dataRetentionConfig, getDataRetentionLimits } from '@services/data-retention/config'
import {
  AI_RETENTION_FAMILIES,
  type AIRetentionContinuationData,
  type AIRetentionFamily,
} from '@queues/psql/types'

export function createAIRetentionContinuationProcessor(
  options?: Partial<Record<AIRetentionFamily, Parameters<typeof cleanupAIRetentionFamily>[1]>>,
) {
  return async (
    job: Pick<Job<AIRetentionContinuationData>, 'data' | 'updateData' | 'moveToDelayed'>,
  ) => {
    const { family } = job.data
    if (!AI_RETENTION_FAMILIES.includes(family))
      throw new Error(`Unknown AI retention family: ${family}`)
    await dataRetentionConfig.waitForInitialization()
    // Native yielding keeps the fixed identity live; adding the active id would drop the request.
    return processRetainedSweep(job, () =>
      cleanupAIRetentionFamily(family, { ...getDataRetentionLimits(), ...options?.[family] }),
    )
  }
}
