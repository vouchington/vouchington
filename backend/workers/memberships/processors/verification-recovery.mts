import type { Job } from 'glide-mq'
import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import {
  enqueueBulkProcessMembershipVerifications,
  enqueueRecoverMembershipVerifications,
} from '@queues/memberships/enqueues'
import { memberships } from '@queues/memberships/queues'
import type { RecoverMembershipVerificationsData } from '@queues/memberships/types'
import {
  findRecoverableMembershipVerificationIds,
  findMembershipVerificationRecoveryUpperBound,
} from '@services/memberships'

export async function recoverMembershipVerifications(
  job: Job<RecoverMembershipVerificationsData>,
): Promise<{ enqueued: number }> {
  if (!job.data.through) {
    const through = await findMembershipVerificationRecoveryUpperBound()
    if (!through) return { enqueued: 0 }
    await job.updateData({ ...job.data, through })
  }
  const through = job.data.through!
  return processPagedDispatcher(job, {
    dispatcher: 'memberships',
    cursorKey: 'id',
    target: memberships,
    targetName: 'memberships',
    readAndDispatch: async pageSize => {
      const ids = await findRecoverableMembershipVerificationIds({
        after: job.data.after,
        through,
        limit: pageSize,
      })
      await enqueueBulkProcessMembershipVerifications(
        ids.map(verificationId => ({ verificationId })),
      )
      return {
        result: { enqueued: ids.length },
        ...(ids.length === pageSize ? { next: { after: ids.at(-1)!, through } } : {}),
      }
    },
    enqueueNext: enqueueRecoverMembershipVerifications,
  })
}
