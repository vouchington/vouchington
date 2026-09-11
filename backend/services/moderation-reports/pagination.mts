import type { ModerationReportStatus } from './config.mts'
import type { ModerationReportSort } from './sort-sql.mts'

export function encodeReportCursor(
  report: {
    cursor_report_count?: number
    cursor_severity_rank?: number
    id: string
  },
  options: {
    sort: ModerationReportSort
    status: ModerationReportStatus
    scope: string
  },
): string {
  const common = {
    cluster: false as const,
    id: report.id,
    sort: options.sort,
    status: options.status,
    scope: options.scope,
  }
  let cursor: Record<string, unknown> = common
  if (options.sort === 'severity') {
    if (report.cursor_report_count === undefined || report.cursor_severity_rank === undefined) {
      throw new Error('Severity cursor requires its complete sort key')
    }
    cursor = {
      ...common,
      report_count: report.cursor_report_count,
      severity_rank: report.cursor_severity_rank,
    }
  } else if (options.sort === 'most_reported') {
    if (report.cursor_report_count === undefined) {
      throw new Error('Most-reported cursor requires its complete sort key')
    }
    cursor = { ...common, report_count: report.cursor_report_count }
  }
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function buildReportPageInfo(
  reports: readonly {
    cursor_report_count?: number
    cursor_severity_rank?: number
    id: string
  }[],
  hasNextPage: boolean,
  hasPreviousPage: boolean,
  options: {
    sort: ModerationReportSort
    status: ModerationReportStatus
    scope: string
  },
) {
  return {
    has_next_page: hasNextPage,
    has_previous_page: hasPreviousPage,
    end_cursor:
      hasNextPage && reports.length > 0 ? encodeReportCursor(reports.at(-1)!, options) : null,
    start_cursor: reports.length > 0 ? encodeReportCursor(reports[0]!, options) : null,
  }
}
