import { detectVelocitySpike } from '@services/vote-integrity/detect-velocity-spike'
import { detectIpCorrelation } from '@services/vote-integrity/detect-ip-correlation'
import { recordVoteIp } from '@services/vote-integrity/ip-window'
import { getVoteIpEvidence } from '@services/elections-votes/vote-ip-evidence'
import { createVoteIntegrityFlag } from '@services/vote-integrity/create-flag'
import onError from '@modules/on-error'
import type { ProcessVoteIntegrityCheckData } from '@queues/vote-aggregation/enqueues/types-vote-integrity'
import { getDateFromUUIDv7 } from '@modules/utils'

export async function processVoteIntegrityCheck(
  data: ProcessVoteIntegrityCheckData,
): Promise<void> {
  try {
    const { entityType, entityId, userId, voteId } = data
    const asOf = new Date()
    const voteAt = getDateFromUUIDv7(voteId)
    if (!voteAt) throw new RangeError('Vote integrity job requires a UUIDv7 ballot ID')
    const ipAddress = await getVoteIpEvidence(voteId)
    await recordVoteIp(entityType, entityId, userId, ipAddress, voteAt, asOf)

    const [velocityResult, ipResult] = await Promise.all([
      detectVelocitySpike(entityType, entityId, asOf),
      detectIpCorrelation(entityType, entityId, ipAddress, asOf),
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
