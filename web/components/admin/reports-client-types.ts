import type {
  MemberFlatModerationReportsResponse,
  StaffClusteredModerationReportsResponse,
  StaffFlatModerationReportsResponse,
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
export type AdminModerationReportsResponse = StaffFlatModerationReportsResponse
export type AdminClusteredModerationReportsResponse = StaffClusteredModerationReportsResponse
export type MemberModerationReportsResponse = MemberFlatModerationReportsResponse
