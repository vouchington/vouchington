import { getMinUuidv7ForDate } from '@modules/utils'
import type {
  ModerationSummaryScan,
  ModerationSummaryStage,
} from '@queues/background/enqueues/moderation-summary-state'
import {
  completeModerationSummaryRank,
  runModerationSummaryCard,
  runModerationSummaryMemberships,
} from './moderation-summary-collection.mts'
import {
  collectModerationSummaryActivityPostPage,
  collectModerationSummaryMemberPage,
  collectModerationSummaryReplyPage,
} from './moderation-summary-activity-pages.mts'
import {
  collectRankApplicationPage,
  collectRankEvaders,
  collectRankReviewPage,
} from './moderation-summary-rank-direct.mts'
import {
  collectRankReportPage,
  collectRankReportPostPage,
} from './moderation-summary-rank-reports.mts'
import {
  walkModerationSummaryPages,
  type ModerationSummaryStageArgs,
  type ModerationSummaryStageResult,
  type PageStep,
} from './moderation-summary-pages.mts'
import {
  resolveModerationSummaryStageLimits,
  type ModerationSummaryPagedStage,
} from './moderation-summary-work.mts'

type StageRunner = (args: ModerationSummaryStageArgs) => Promise<ModerationSummaryStageResult>
type ScanPage = (
  scan: ModerationSummaryScan,
  size: number,
  args: ModerationSummaryStageArgs,
) => Promise<PageStep<ModerationSummaryScan>>

/** A stage that reads up to its page cap of one community scan's rows. */
function scanStage(stage: ModerationSummaryPagedStage, page: ScanPage): StageRunner {
  return async args => {
    const { pageSize, maxBatches } = resolveModerationSummaryStageLimits(stage, args.limits)
    const step = await walkModerationSummaryPages(args.collection.scan!, maxBatches, scan =>
      page(scan, pageSize, args),
    )
    return {
      next: step.next ?? stage,
      collection: { ...args.collection, scan: step.state },
      communities: [...args.communities],
    }
  }
}

// The memberships stage has already pinned the activity window end in every later stage's state.
function activityRange({ collection, windowStart }: ModerationSummaryStageArgs) {
  const end = new Date(collection.activityWindowEnd!)
  return {
    start: windowStart,
    end,
    startId: getMinUuidv7ForDate(windowStart),
    endId: getMinUuidv7ForDate(end),
  }
}

const runEvaders: StageRunner = async args => {
  const scan = await collectRankEvaders(args.collection.scan!)
  return {
    next: 'memberships',
    collection: completeModerationSummaryRank({ ...args.collection, scan }),
    communities: [...args.communities],
  }
}

/** One runner per stage job. A job runs exactly one of them and enqueues the `next` it returns. */
const stageRunners: Record<ModerationSummaryStage, StageRunner> = {
  memberships: runModerationSummaryMemberships,
  reviews: scanStage('reviews', collectRankReviewPage),
  applications: scanStage('applications', collectRankApplicationPage),
  reportPosts: scanStage('reportPosts', collectRankReportPostPage),
  reports: scanStage('reports', collectRankReportPage),
  evaders: runEvaders,
  members: scanStage('members', (scan, size, args) => {
    const { start, end, startId, endId } = activityRange(args)
    return collectModerationSummaryMemberPage(scan, startId, endId, start, end, size)
  }),
  activityPosts: scanStage('activityPosts', (scan, size, args) => {
    const { startId, endId } = activityRange(args)
    return collectModerationSummaryActivityPostPage(scan, startId, endId, size)
  }),
  replies: scanStage('replies', (scan, size, args) =>
    collectModerationSummaryReplyPage(scan, activityRange(args).endId, size),
  ),
  card: runModerationSummaryCard,
}

export function runModerationSummaryStage(
  stage: ModerationSummaryStage,
  args: ModerationSummaryStageArgs,
): Promise<ModerationSummaryStageResult> {
  return stageRunners[stage](args)
}
