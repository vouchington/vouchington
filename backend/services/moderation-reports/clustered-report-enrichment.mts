import type { PendingModerationReport } from './get.mts'
import { attachBanEvasionContext } from './ban-evasion-context-attach.mts'
import { attachJudgements } from './judgement-attach.mts'
import { attachPostModerationContext } from './post-moderation-context-attach.mts'
import { applyDeletedTargetLabel } from './redaction.mts'

export async function enrichClusteredReports(
  reports: PendingModerationReport[],
): Promise<PendingModerationReport[]> {
  const withJudgements = await attachJudgements(reports.map(applyDeletedTargetLabel))
  const withPostContext = await attachPostModerationContext(withJudgements, 'staff')
  return attachBanEvasionContext(withPostContext)
}
