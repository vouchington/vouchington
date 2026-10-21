import { detectVelocitySpike } from '@services/vote-integrity/detect-velocity-spike'
import { detectIpCorrelation } from '@services/vote-integrity/detect-ip-correlation'
import { createVoteIntegrityFlag } from '@services/vote-integrity/create-flag'
import onError from '@modules/on-error'
import type { ProcessVoteIntegrityCheckData } from '@queues/vote-aggregation/enqueues/types-vote-integrity'

export async function processVoteIntegrityCheck(
  data: ProcessVoteIntegrityCheckData,
): Promise<void> {
  try {
    const { entityType, entityId } = data
    const asOf = new Date()

    const [velocityResult, ipResult] = await Promise.all([
      detectVelocitySpike(entityType, entityId, asOf),
      detectIpCorrelation(entityType, entityId, asOf),
    ])

    if (velocityResult.flagged) {
      await createVoteIntegrityFlag(entityType, entityId, 'velocity_spike', velocityResult.details)
    }

    if (ipResult.flagged) {
      await createVoteIntegrityFlag(entityType, entityId, 'ip_correlation', ipResult.details)
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
