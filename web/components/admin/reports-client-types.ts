import type {
  MemberFlatModerationReportsResponse,
  StaffClusteredModerationReportsResponse,
  StaffModerationReport,
  StaffModerationReportCluster,
  StaffModerationReportDuplicateCluster,
} from '@/lib/api/client/reports'

export type ModerationJudgementAction = NonNullable<
  StaffModerationReport['judgement']
>['recommended_action']
export type AdminModerationReport = StaffModerationReport
export type ModerationReportReasonBreakdown = StaffModerationReportCluster['reason_breakdown']
export type AdminModerationReportCluster = StaffModerationReportCluster
export type AdminModerationReportDuplicateCluster = StaffModerationReportDuplicateCluster
export type AdminClusteredModerationReportsResponse = StaffClusteredModerationReportsResponse
export type MemberModerationReportsResponse = MemberFlatModerationReportsResponse
