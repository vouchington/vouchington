import { detectVelocitySpike } from '@services/vote-integrity/detect-velocity-spike'
import { detectIpCorrelation } from '@services/vote-integrity/detect-ip-correlation'
import { createVoteIntegrityFlag } from '@services/vote-integrity/create-flag'
import onError from '@modules/on-error'
import type { ProcessVoteIntegrityCheckData } from '@queues/vote-integrity/types'

export async function processVoteIntegrityCheck(
  data: ProcessVoteIntegrityCheckData,
): Promise<void> {
  try {
    const { entityType, entityId } = data

    const [velocityResult, ipResult] = await Promise.all([
      detectVelocitySpike(entityType, entityId),
      detectIpCorrelation(entityType, entityId),
    ])

    if (velocityResult.flagged) {
      await createVoteIntegrityFlag(entityType, entityId, 'velocity_spike', velocityResult.details)
    }

    if (ipResult.flagged) {
      await createVoteIntegrityFlag(entityType, entityId, 'ip_correlation', ipResult.details)
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}
