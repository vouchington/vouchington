import type { CommunityBanEvasionContext, ModerationReportSort } from '@services/moderation-reports'

export function redactCommunityReport<T extends { reporter_user_id?: unknown; note?: unknown }>(
  report: T,
) {
  const { reporter_user_id: _, note: __, ...redactedReport } = report
  return redactedReport
}

export function redactCommunityBanEvasionContext<T extends CommunityBanEvasionContext>(context: T) {
  return {
    community_id: context.community_id,
    community_slug: context.community_slug,
  }
}

export function communityModeratorVisibleReportSort(
  sort: ModerationReportSort,
): ModerationReportSort {
  return sort === 'severity' ? 'created_at_desc' : sort
}

export function parseCommunityReportSort(value: unknown): ModerationReportSort {
  if (
    value === 'severity' ||
    value === 'most_reported' ||
    value === 'created_at_asc' ||
    value === 'created_at_desc'
  ) {
    return value
  }
  return 'severity'
}
