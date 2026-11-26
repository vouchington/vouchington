import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import type {
  ModerationSummaryStageArgs,
  ModerationSummaryStageResult,
} from '@services/communities/moderation-summary-pages'
import { runModerationSummaryStage } from '@services/communities/moderation-summary-stages'
import {
  getModerationSummaryStageLimits,
  type ModerationSummaryPagedStage,
} from '@services/communities/moderation-summary-work'
import { registerScenarioContract, type PlanExpectation } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  DIGEST_MEMBERSHIP_PAGE_SIZE,
  DIGEST_SOURCE_PAGE_SIZE,
} from '../seed-data/moderation-digest-pages.mts'

const MAIN_ROWS: Record<ModerationSummaryPagedStage, Record<string, readonly number[]>> = {
  memberships: { community_members: [1, 10, 1] },
  reviews: { community_post_reviews: [1, 25, 1], posts: [0, 25, 1] },
  applications: { community_applications: [1, 286, 1] },
  reportPosts: { posts: [1, 25, 25], moderation_reports: [0, 0, 1] },
  reports: { moderation_reports: [1, 25, 1], posts: [0, 1, 1] },
  // Main can walk all 312 author posts before checking the community.
  // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7186707152
  members: { community_members: [1, 25, 1], users: [0, 25, 1], posts: [0, 312, 0] },
  activityPosts: { posts: [25, 26] },
  replies: { posts: [25, 1] },
}

async function expectations(stage: ModerationSummaryPagedStage): Promise<PlanExpectation[]> {
  const reads = Object.entries(MAIN_ROWS[stage]).flatMap(([relation, caps]) =>
    caps.map((max, captureIndex): PlanExpectation => ({
      kind: 'maxProcessedRows',
      relation,
      max,
      captureIndex,
    })),
  )
  if (stage !== 'applications') return reads
  const { rows } = await write<{ total: number }>(
    '/* countModerationDigestApplicationFixture */ SELECT count(*)::int AS total FROM community_applications',
  )
  // https://github.com/vouchington/vouchington/issues/6575 tracks the broad first-page scan.
  return reads.map(gate =>
    gate.kind === 'maxProcessedRows' && gate.captureIndex === 1
      ? { ...gate, max: rows[0]!.total }
      : gate,
  )
}

export async function captureModerationDigestPages(
  stage: ModerationSummaryPagedStage,
  initial: ModerationSummaryStageArgs,
  queries: readonly string[],
  validate: (first: ModerationSummaryStageResult, last: ModerationSummaryStageResult) => void,
) {
  const scenario = `moderation-digest-${stage.toLowerCase()}-at-cap`
  const cap = stage === 'memberships' ? DIGEST_MEMBERSHIP_PAGE_SIZE : DIGEST_SOURCE_PAGE_SIZE
  assert.deepEqual(getModerationSummaryStageLimits(stage), { pageSize: cap, maxBatches: 1 })
  const captures = [...queries, queries.at(-1)!]
  if (stage === 'memberships') captures.push('isModerationSummaryCommunityEligible')
  registerScenarioContract(scenario, {
    expectations: await expectations(stage),
    crossPartition: { posts: 'The digest collects posts and replies across the retained window.' },
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await runModerationSummaryStage(stage, initial)
      assert.equal(first.next, stage)
      const last = await runModerationSummaryStage(stage, {
        ...initial,
        collection: first.collection,
      })
      validate(first, last)
    },
    undefined,
    queries,
    { exactCapturedNames: captures },
  )
}
