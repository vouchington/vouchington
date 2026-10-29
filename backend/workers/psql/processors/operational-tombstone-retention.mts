import { processRetainedSweep, type PriorityQueue } from '@data-stores/valkey-glide-mq'
import { createOperationalTombstoneRetentionEnqueue } from '@queues/psql/enqueues/operational-tombstone-retention'
import {
  OPERATIONAL_TOMBSTONE_FAMILIES,
  type OperationalTombstoneFamily,
  type OperationalTombstoneRetentionData,
} from '@queues/psql/types'
import { dataRetentionConfig, getDataRetentionLimits } from '@services/data-retention/config'
import type { runDataRetentionCleanup } from '@services/data-retention'
import type { cleanupOperationalTombstones } from '@services/data-retention/cleanup-operational-tombstones'
import type { Job } from 'glide-mq'

/** One composition binds production and private native registrations to the same queue and work. */
export function createOperationalTombstoneRetentionHandlers(
  queue: PriorityQueue<unknown>,
  cleanupFamily: typeof cleanupOperationalTombstones,
) {
  const admit = createOperationalTombstoneRetentionEnqueue(queue)
  return {
    admit,
    processRetained: createOperationalTombstoneRetentionProcessor(cleanupFamily),
    admitPending: createOperationalTombstoneRetentionAdmission(admit),
  }
}

/** Continue each productive family with its normal bounded page budget. */
function createOperationalTombstoneRetentionProcessor(
  cleanupFamily: typeof cleanupOperationalTombstones,
) {
  return async (
    job: Pick<Job<OperationalTombstoneRetentionData>, 'data' | 'updateData' | 'moveToDelayed'>,
  ) => {
    const { family } = job.data
    if (!OPERATIONAL_TOMBSTONE_FAMILIES.includes(family))
      throw new Error(`Unknown operational tombstone family: ${family}`)
    await dataRetentionConfig.waitForInitialization()
    return processRetainedSweep(job, async () => {
      const result = await cleanupFamily(family, getDataRetentionLimits())
      // A locked child cannot make progress. Complete this claim and let the next daily seed
      // reactivate it after the lock clears; immediate native yielding would spin on that lock.
      return { ...result, hasMore: result.hasMore && !result.stalled }
    })
  }
}

/** The daily run admits only productive remaining work after its own cleanup pages. */
const resultFamilies = [
  ['undoneActivityPubLikes', 'activitypub_post_likes'],
  ['staleRemoteActors', 'remote_actors'],
  ['feedHostnameBlocks', 'feed_hostname_blocks'],
  ['otherHostnameBlocks', 'other_hostname_blocks'],
  ['deletedConversations', 'deleted_conversations'],
  ['appAttestationKeys', 'app_attestation_keys'],
] as const satisfies readonly [
  keyof Awaited<ReturnType<typeof runDataRetentionCleanup>>,
  OperationalTombstoneFamily,
][]

function createOperationalTombstoneRetentionAdmission(
  enqueue: ReturnType<typeof createOperationalTombstoneRetentionEnqueue>,
) {
  return async (
    result: Pick<
      Awaited<ReturnType<typeof runDataRetentionCleanup>>,
      (typeof resultFamilies)[number][0]
    >,
  ): Promise<void> => {
    const pending = resultFamilies
      .filter(([key]) => result[key].hasMore && !result[key].stalled)
      .map(([, family]) => family)
    if (pending.length > 0) await enqueue(pending)
  }
}
