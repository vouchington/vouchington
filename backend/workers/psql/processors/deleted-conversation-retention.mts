import { processRetainedSweep, type PriorityQueue } from '@data-stores/valkey-glide-mq'
import { createDeletedConversationRetentionEnqueue } from '@queues/psql/enqueues/deleted-conversation-retention'
import { dataRetentionConfig, getDataRetentionLimits } from '@services/data-retention/config'
import type { runDataRetentionCleanup } from '@services/data-retention'
import type { cleanupOperationalTombstones } from '@services/data-retention/cleanup-operational-tombstones'
import type { Job } from 'glide-mq'

/** One composition binds production and private native registrations to the same queue and work. */
export function createDeletedConversationRetentionHandlers(
  queue: PriorityQueue<unknown>,
  cleanupFamily: typeof cleanupOperationalTombstones,
) {
  const admit = createDeletedConversationRetentionEnqueue(queue)
  return {
    admit,
    processRetained: createDeletedConversationRetentionProcessor(cleanupFamily),
    admitPending: createDeletedConversationRetentionAdmission(admit),
  }
}

/** Continue only the deleted-conversation family with its normal bounded page budget. */
function createDeletedConversationRetentionProcessor(
  cleanupFamily: typeof cleanupOperationalTombstones,
) {
  return async (job: Pick<Job, 'updateData' | 'moveToDelayed'>) => {
    await dataRetentionConfig.waitForInitialization()
    return processRetainedSweep(job, async () => {
      const result = await cleanupFamily('deleted_conversations', getDataRetentionLimits())
      // A locked child cannot make progress. Complete this claim and let the next daily seed
      // reactivate it after the lock clears; immediate native yielding would spin on that lock.
      return { ...result, hasMore: result.hasMore && !result.stalled }
    })
  }
}

/** The daily run admits only productive remaining work after its own cleanup pages. */
function createDeletedConversationRetentionAdmission(
  enqueue: ReturnType<typeof createDeletedConversationRetentionEnqueue>,
) {
  return async (
    result: Pick<Awaited<ReturnType<typeof runDataRetentionCleanup>>, 'deletedConversations'>,
  ): Promise<void> => {
    if (result.deletedConversations.hasMore && !result.deletedConversations.stalled) await enqueue()
  }
}
