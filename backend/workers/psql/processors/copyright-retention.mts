import { createHash } from 'node:crypto'
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

export async function admitCopyrightRetentionContinuation(
  pending: CopyrightRetentionFamily[],
  jobId: string | undefined,
): Promise<void> {
  if (pending.length === 0) return
  if (!jobId) throw new Error('Copyright retention continuation needs the current job ID')
  const runId = createHash('sha256').update(jobId).digest('hex')
  await enqueueDataRetentionCleanupContinuation({
    runId,
    step: 1,
    activeClassifierSweeps: [],
    activeMembershipFamilies: [],
    activePostModerationKinds: [],
    copyrightFamilies: pending,
  })
}

export type CopyrightRetentionScope = Omit<
  NonNullable<Parameters<typeof runCopyrightOperationalRetentionCleanup>[0]>,
  'activeFamilies'
>

export async function processCopyrightRetentionContinuation(
  continuation: NonNullable<PsqlRetentionJobData['continuation']>,
  options: CopyrightRetentionScope = {},
) {
  const copyrightFamilies = continuation.copyrightFamilies ?? []
  const result = await runCopyrightOperationalRetentionCleanup({
    ...options,
    activeFamilies: copyrightFamilies,
    limits: options.limits ?? getDataRetentionLimits(),
  })
  const pending = unfinishedCopyrightFamilies(result, copyrightFamilies)
  if (pending.length > 0) {
    await enqueueDataRetentionCleanupContinuation({
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
