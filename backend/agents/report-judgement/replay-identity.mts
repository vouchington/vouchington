import { createHash } from 'node:crypto'
import type {
  ModerationReportEntityType,
  ModerationReportJudgement,
} from '@services/moderation-reports'

type Identity = {
  entityType: ModerationReportEntityType
  entityId: string
  triggeringReportId: string
  rerunById?: string | null
  runId?: string | null
  operationId: string
}

export function reportJudgementIdentitySha256(identity: Identity): string {
  const { entityType, entityId, triggeringReportId, rerunById, runId, operationId } = identity
  return createHash('sha256')
    .update(
      JSON.stringify([
        entityType,
        entityId,
        triggeringReportId,
        rerunById ?? null,
        runId ?? null,
        operationId,
      ]),
    )
    .digest('hex')
}

export function assertReportJudgementReplayIdentity(
  replay: ModerationReportJudgement,
  identity: Identity,
  identitySha256: string,
): void {
  if (
    replay.entity_type !== identity.entityType ||
    replay.entity_id !== identity.entityId ||
    replay.run_id !== (identity.runId ?? null) ||
    replay.agent_call_identity_sha256 !== identitySha256
  ) {
    throw new Error('Judgement operation identity belongs to another request')
  }
}
