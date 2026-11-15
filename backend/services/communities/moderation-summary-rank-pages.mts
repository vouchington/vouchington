import type { ModerationSummaryScan } from '@queues/background/enqueues/moderation-summary-state'
import {
  collectRankReviewPage,
  collectRankApplicationPage,
  collectRankEvaders,
} from './moderation-summary-rank-direct.mts'
import {
  collectRankReportPostPage,
  collectRankReportPage,
} from './moderation-summary-rank-reports.mts'
export async function collectModerationSummaryRankPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<void> {
  // Each closed phase runs at most once: a full page or a report-parent cycle yields to continuation.
  if (scan.stage === 'reviews') await collectRankReviewPage(scan, size)
  if (scan.stage === 'applications') await collectRankApplicationPage(scan, size)
  if (scan.stage === 'report-posts') await collectRankReportPostPage(scan, size)
  if (scan.stage === 'reports') await collectRankReportPage(scan, size)
  if (scan.stage === 'evaders') await collectRankEvaders(scan)
}
