import type { Job } from 'glide-mq'
import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { memberships } from '@queues/memberships/queues'
import {
  enqueueBulkProcessStripePurchaseCollisions,
  enqueueRecoverStripePurchaseCollisions,
} from '@queues/memberships/enqueues'
import type { RecoverStripePurchaseCollisionsData } from '@queues/memberships/types'
import {
  findStripePurchaseCollisionWorkIds,
  findStripePurchaseCollisionWorkUpperBound,
} from '@services/memberships/ineligible-stripe-purchase-reversal/collision-work'

/** Each page admits immutable work ids; the next scheduled sweep also sees late commits. */
export async function recoverStripePurchaseCollisions(
  job: Job<RecoverStripePurchaseCollisionsData>,
) {
  if (!job.data.through) {
    const through = await findStripePurchaseCollisionWorkUpperBound()
    if (!through) return { enqueued: 0 }
    await job.updateData({ ...job.data, through })
  }
  const through = job.data.through!
  return processPagedDispatcher(job, {
    dispatcher: 'memberships',
    cursorKey: 'id',
    target: memberships,
    targetName: 'memberships',
    readAndDispatch: async limit => {
      const ids = await findStripePurchaseCollisionWorkIds({
        after: job.data.after,
        through,
        limit,
      })
      await enqueueBulkProcessStripePurchaseCollisions(ids.map(workId => ({ workId })))
      return {
        result: { enqueued: ids.length },
        ...(ids.length === limit ? { next: { after: ids.at(-1)!, through } } : {}),
      }
    },
    enqueueNext: enqueueRecoverStripePurchaseCollisions,
  })
}
