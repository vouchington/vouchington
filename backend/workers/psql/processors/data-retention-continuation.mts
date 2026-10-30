import { createHash } from 'node:crypto'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { enqueueDataRetentionCleanupContinuation } from '@queues/psql/enqueues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import {
  admitCopyrightRetentionContinuation,
  unfinishedCopyrightFamilies,
} from './copyright-retention.mts'
import { unfinishedClassifierSweeps, unfinishedMembershipFamilies } from './retention-sweeps.mts'

type Dependencies = {
  enqueueDataRetentionCleanupContinuation?: typeof enqueueDataRetentionCleanupContinuation
}

/** Chain the families that hit their page cap; the first run also admits the copyright chain. */
export async function admitDataRetentionContinuations(
  result: Awaited<ReturnType<typeof runDataRetentionCleanup>>,
  continuation: PsqlRetentionJobData['continuation'],
  jobId: string | undefined,
  dependencies?: Dependencies,
): Promise<void> {
  const activeClassifierSweeps = unfinishedClassifierSweeps(result.classifierRecords)
  const activeMembershipFamilies = unfinishedMembershipFamilies(result)
  const activeCopyrightFamilies = unfinishedCopyrightFamilies(result)
  const activePostModerationKinds = result.postModerationLedger.remainingKinds
  const enqueueCleanup =
    dependencies?.enqueueDataRetentionCleanupContinuation ?? enqueueDataRetentionCleanupContinuation
  const activeAiUsage = result.aiUsageRecords.hasMore
  const userPurge = result.softDeletedUsers.hasMore ? result.softDeletedUsers.userPurge : undefined
  if (!continuation)
    await admitCopyrightRetentionContinuation(activeCopyrightFamilies, jobId, enqueueCleanup)
  if (
    activeClassifierSweeps.length > 0 ||
    activeMembershipFamilies.length > 0 ||
    activePostModerationKinds.length > 0 ||
    result.softDeletedUsers.hasMore ||
    activeAiUsage
  ) {
    if (!jobId) throw new Error('Data retention continuation needs the current job ID')
    const runId = continuation?.runId ?? createHash('sha256').update(jobId).digest('hex')
    await enqueueCleanup({
      runId,
      step: (continuation?.step ?? 0) + 1,
      activeClassifierSweeps,
      activeMembershipFamilies,
      activePostModerationKinds,
      ...(userPurge ? { userPurge } : {}),
      activeAiUsage,
    })
  }
}
