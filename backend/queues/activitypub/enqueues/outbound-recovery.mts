import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { ACTIVITYPUB_RECOVER_OUTBOUND_JOB } from '@queues/background/enqueues/activitypub-jobs'
import type { RecoverOutboundDistributionData } from '@queues/background/enqueues/activitypub-domain'
import type { EnqueueReturnType } from '@voucha/types'

const enqueueRecovery = createBackgroundEnqueue(ACTIVITYPUB_RECOVER_OUTBOUND_JOB)

export function enqueueRecoverOutboundDistribution(
  source: RecoverOutboundDistributionData['source'],
): EnqueueReturnType {
  return enqueueRecovery({ source })
}
