import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import type { ModerationSummaryStage } from '@queues/background/enqueues/moderation-summary-state'

/** The stages that read a page of rows; each has its own page size and pages-per-run cap. */
export type ModerationSummaryPagedStage = Exclude<ModerationSummaryStage, 'evaders' | 'card'>
const fieldPrefix: Record<ModerationSummaryPagedStage, string> = {
  memberships: 'memberships',
  reviews: 'reviews',
  applications: 'applications',
  reportPosts: 'report_posts',
  reports: 'reports',
  members: 'members',
  activityPosts: 'activity_posts',
  replies: 'replies',
}
export const moderationSummaryPagedStages = Object.keys(
  fieldPrefix,
) as ModerationSummaryPagedStage[]
const defaultPageSize = (stage: ModerationSummaryPagedStage) => (stage === 'memberships' ? 10 : 25)
const pageSizeField = (stage: ModerationSummaryPagedStage) => `${fieldPrefix[stage]}_page_size`
const maxBatchesField = (stage: ModerationSummaryPagedStage) =>
  `${fieldPrefix[stage]}_max_batches_per_run`
const entries = <T,>(make: (stage: ModerationSummaryPagedStage) => [string, T][]) =>
  Object.fromEntries(moderationSummaryPagedStages.flatMap(make))

export const MODERATION_SUMMARY_EVASION_RANK_MAX = 100
const evasionRankField = 'suspected_ban_evaders_rank_cap'

export const moderationSummaryWorkMaxValues: Record<string, number> = {
  ...entries(stage => [
    [pageSizeField(stage), 100],
    [maxBatchesField(stage), 20],
  ]),
  [evasionRankField]: MODERATION_SUMMARY_EVASION_RANK_MAX,
}
export const moderationSummaryWorkDescriptions: Record<string, string> = {
  ...entries(stage => [
    [pageSizeField(stage), `Rows read by one ${stage} page of a moderator digest collection job.`],
    [
      maxBatchesField(stage),
      `Pages one ${stage} moderator digest collection job reads before it continues.`,
    ],
  ]),
  [evasionRankField]:
    'Maximum suspected ban evaders counted toward a community’s ranking in the moderator digest. The displayed count keeps its existing bound.',
}
export const moderationSummaryWorkConfig = new DynamicConfig({
  key: 'moderation-summary-work-config',
  fieldTypes: {
    ...entries<'number'>(stage => [
      [pageSizeField(stage), 'number'],
      [maxBatchesField(stage), 'number'],
    ]),
    [evasionRankField]: 'number',
  },
  defaultFields: {
    ...entries(stage => [
      [pageSizeField(stage), defaultPageSize(stage)],
      [maxBatchesField(stage), 1],
    ]),
    [evasionRankField]: MODERATION_SUMMARY_EVASION_RANK_MAX,
  },
})

export function getModerationSummaryEvasionRankCap(): number {
  return getBoundedPositiveIntegerField(moderationSummaryWorkConfig, evasionRankField, {
    defaultValue: MODERATION_SUMMARY_EVASION_RANK_MAX,
    maxValue: MODERATION_SUMMARY_EVASION_RANK_MAX,
  })
}

/** Test-only page size overrides: one for memberships and one for every source stage. */
export type ModerationSummaryPageSizeOverride = {
  membershipPageSize: number
  sourcePageSize: number
}

/** A stage's configured limits, with an optional page size override that must stay in bounds. */
export function resolveModerationSummaryStageLimits(
  stage: ModerationSummaryPagedStage,
  override?: ModerationSummaryPageSizeOverride,
): { pageSize: number; maxBatches: number } {
  const limits = getModerationSummaryStageLimits(stage)
  if (!override) return limits
  const pageSize = stage === 'memberships' ? override.membershipPageSize : override.sourcePageSize
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > moderationSummaryWorkMaxValues[pageSizeField(stage)]!
  )
    throw new RangeError('Invalid moderator digest work page size')
  return { ...limits, pageSize }
}

/** The page size and pages-per-run cap of one collection stage. */
export function getModerationSummaryStageLimits(stage: ModerationSummaryPagedStage): {
  pageSize: number
  maxBatches: number
} {
  return {
    pageSize: getBoundedPositiveIntegerField(moderationSummaryWorkConfig, pageSizeField(stage), {
      defaultValue: defaultPageSize(stage),
      maxValue: 100,
    }),
    maxBatches: getBoundedPositiveIntegerField(
      moderationSummaryWorkConfig,
      maxBatchesField(stage),
      { defaultValue: 1, maxValue: 20 },
    ),
  }
}
