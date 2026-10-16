import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { loadCommunityForModerator } from '@services/communities'
import {
  MODERATION_REPORT_RESOLUTION_STATUSES,
  resolveModerationReport,
  type ModerationReportResolutionStatus,
} from '@services/moderation-reports'
import { redactCommunityReport } from '@services/moderation-reports/community-helpers'
import { isModerationStaff } from '@services/users'
import type { CommunityModerationHandler } from './community-moderation-contract.mts'

export const resolveCommunityReport: CommunityModerationHandler = async (user, args) => {
  const reportId = args.reportId as string
  assert(isUUID(reportId), 422, 'Invalid report ID')
  const { community } = await loadCommunityForModerator(user, args.community)
  const status =
    typeof args.status === 'string' &&
    MODERATION_REPORT_RESOLUTION_STATUSES.includes(args.status as ModerationReportResolutionStatus)
      ? (args.status as ModerationReportResolutionStatus)
      : null
  assert(status, 422, 'Invalid status')

  const report = await resolveModerationReport(reportId, {
    trainingEvidence: 'agent',
    communityId: community.id,
    resolvedById: user.id,
    status,
  })
  return { report: isModerationStaff(user) ? report : redactCommunityReport(report) }
}
