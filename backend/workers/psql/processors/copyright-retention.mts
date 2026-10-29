import { runCopyrightOperationalRetentionCleanup } from '@services/data-retention'
import { getDataRetentionLimits } from '@services/data-retention/config'
import { enqueueDataRetentionCleanupContinuation } from '@queues/psql/enqueues'
import {
  COPYRIGHT_RETENTION_FAMILIES,
  type CopyrightRetentionFamily,
  type PsqlRetentionJobData,
} from '@queues/psql/types'

export function unfinishedCopyrightFamilies(
  result: Partial<Record<CopyrightRetentionFamily, { hasMore: boolean }>>,
  activeFamilies: readonly CopyrightRetentionFamily[] = COPYRIGHT_RETENTION_FAMILIES,
): CopyrightRetentionFamily[] {
  return activeFamilies.filter(family => result[family]?.hasMore)
}

export async function processCopyrightRetentionContinuation(
  continuation: NonNullable<PsqlRetentionJobData['continuation']>,
  dependencies: {
    cleanup?: typeof runCopyrightOperationalRetentionCleanup
    enqueue?: typeof enqueueDataRetentionCleanupContinuation
  } = {},
) {
  const copyrightFamilies = continuation.copyrightFamilies ?? []
  const result = await (dependencies.cleanup ?? runCopyrightOperationalRetentionCleanup)({
    activeFamilies: copyrightFamilies,
    limits: getDataRetentionLimits(),
  })
  const pending = unfinishedCopyrightFamilies(result, copyrightFamilies)
  if (pending.length > 0) {
    await (dependencies.enqueue ?? enqueueDataRetentionCleanupContinuation)({
      runId: continuation.runId,
      step: continuation.step + 1,
      activeClassifierSweeps: [],
      activeMembershipFamilies: [],
      activePostModerationKinds: [],
      copyrightFamilies: pending,
    })
  }
  return result
}
