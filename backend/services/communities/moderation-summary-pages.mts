import type { CommunityModerationSummaryEmailProps } from '@email-templates/core'
import {
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryCollection,
  type ModerationSummaryNext,
  type ModerationSummaryScan,
} from '@queues/background/enqueues/moderation-summary-state'
import type { ModerationSummaryPageSizeOverride } from './moderation-summary-work.mts'

export type ModerationSummaryCard = CommunityModerationSummaryEmailProps['communities'][number]

/** What one stage job reads: the recipient window and the state the previous stage left. */
export type ModerationSummaryStageArgs = {
  userId: string
  windowStart: Date
  windowEnd: Date
  eligibilityAt: Date
  collection: ModerationSummaryCollection
  communities: readonly ModerationSummaryCard[]
  limits?: ModerationSummaryPageSizeOverride
}
/** The state a stage hands to the job it enqueues next. */
export type ModerationSummaryStageResult = {
  next: ModerationSummaryNext
  collection: ModerationSummaryCollection
  communities: ModerationSummaryCard[]
}

/** One page of a stage: the next state, and the next job when this stage is finished. */
export type PageStep<TState> = { state: TState; next: ModerationSummaryNext | null }

/** Counts one more row, saturating at the 99+ display cap. */
export function capModerationSummaryCount(count: number): number {
  return Math.min(100, count + 1)
}

/** The scan a later stage starts from: a fresh source cursor with the counters carried over. */
export function startModerationSummarySource(scan: ModerationSummaryScan): ModerationSummaryScan {
  return { ...scan, afterId: MODERATION_SUMMARY_ZERO_ID, sourceUpperId: null }
}

/** Reads up to `maxBatches` pages, stopping early when the stage finishes. */
export async function walkModerationSummaryPages<TState>(
  state: TState,
  maxBatches: number,
  page: (state: TState) => Promise<PageStep<TState>>,
): Promise<PageStep<TState>> {
  const step = await page(state)
  return step.next !== null || maxBatches <= 1
    ? step
    : walkModerationSummaryPages(step.state, maxBatches - 1, page)
}
