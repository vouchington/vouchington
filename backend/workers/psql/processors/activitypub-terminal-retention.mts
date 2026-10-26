import { enqueueTerminalActivityRetention } from '@queues/psql/enqueues/activitypub-terminal-retention'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { dataRetentionConfig, getDataRetentionLimits } from '@services/data-retention/config'
import type { cleanupActivityPubTerminalIdentities } from '@services/data-retention/cleanup-activitypub-tombstones'
import type { TerminalActivityRetentionData } from '@queues/psql/types'
import type { Job } from 'glide-mq'

/** One production processor factory; family dispatch and page limits use the same service contract. */
export function createTerminalActivityRetentionProcessor(
  cleanupFamily: typeof cleanupActivityPubTerminalIdentities,
) {
  return async (
    job: Pick<Job<TerminalActivityRetentionData>, 'data' | 'updateData' | 'moveToDelayed'>,
  ) => {
    await dataRetentionConfig.waitForInitialization()
    return processRetainedSweep(job, () => cleanupFamily(job.data.family, getDataRetentionLimits()))
  }
}

/** The daily job already committed real bounded work; admit only its still-pending families. */
export async function admitPendingTerminalActivityRetention(
  result: Awaited<ReturnType<typeof runDataRetentionCleanup>>,
): Promise<void> {
  const pending: TerminalActivityRetentionData['family'][] = []
  if (result.federationRetention.terminalFollowIdentities.hasMore) pending.push('follow')
  if (result.federationRetention.terminalLikeIdentities.hasMore) pending.push('like')
  if (pending.length > 0) await enqueueTerminalActivityRetention(pending)
}
