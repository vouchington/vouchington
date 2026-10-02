import assert from 'http-assert'
import {
  getModerationReportTargetUserId,
  isModerationReportInCommunityScope,
  resolveModerationReport,
} from '@services/moderation-reports'
import type { ModerationTrainingEvidence } from '@services/moderation-training'
import { createUserWarning } from './create.mts'
import type { CreateUserWarningInput } from './parse.mts'

export async function issueUserWarning(
  staffUserId: string,
  input: CreateUserWarningInput,
  trainingEvidence: ModerationTrainingEvidence,
) {
  if (input.reportId) {
    const targetUserId = await getModerationReportTargetUserId(input.reportId)
    assert(targetUserId !== null, 404, 'Report not found')
    assert(targetUserId === input.userId, 422, 'Report does not target the warned user')
    if (input.communityId)
      assert(
        await isModerationReportInCommunityScope(input.reportId, input.communityId),
        422,
        'Report does not belong to the specified community',
      )
  }
  const warning = await createUserWarning(staffUserId, input, { returnExistingForReport: true })
  if (input.reportId && input.resolveReport)
    await resolveModerationReport(input.reportId, {
      status: 'actioned',
      resolvedById: staffUserId,
      communityId: input.communityId ?? undefined,
      trainingEvidence,
    })
  return warning
}
