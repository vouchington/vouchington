import type {
  CommunityModerationReport,
  CommunityModerationReportsResponseBody,
} from '@/types/api-responses'
import type { ModerationReportSortParam } from '@/lib/api/client/reports'

export type CommunityModerationReportsPage = CommunityModerationReportsResponseBody & {
  page_info: NonNullable<CommunityModerationReportsResponseBody['page_info']>
}

export function communityModeratorVisibleReportSort(
  sort: ModerationReportSortParam,
): ModerationReportSortParam {
  return sort === 'severity' ? 'created_at_desc' : sort
}

export function createInitialReportsPage(
  reportsData?: CommunityModerationReportsResponseBody,
): CommunityModerationReportsPage {
  return {
    reports: reportsData?.reports ?? [],
    page_info: reportsData?.page_info ?? {
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    },
  }
}

export function mergeVisibleReports(
  pages: readonly CommunityModerationReportsPage[],
  initialPage: CommunityModerationReportsPage,
  resolvedReportIds: ReadonlySet<string>,
): CommunityModerationReport[] {
  const reportPages = pages.some(page => Array.isArray(page.reports)) ? pages : [initialPage]
  const visibleReports: CommunityModerationReport[] = []
  const seenIds = new Set<string>()

  for (const page of reportPages) {
    for (const report of page.reports ?? []) {
      if (resolvedReportIds.has(report.id) || seenIds.has(report.id)) continue
      seenIds.add(report.id)
      visibleReports.push(report)
    }
  }

  return visibleReports
}
