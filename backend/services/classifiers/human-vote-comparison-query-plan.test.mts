import { getClassifiersWorkLimit } from './work-limits.mts'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  analyzeClassifierComparisonPlanTables,
  COMPARISON_BATCH_INDEXES,
  summarizeComparisonBatchScans,
} from '../../test-helpers/data-stores/psql/classifier-comparison-plans.mts'
import {
  insertCompletedEmptyBatches,
  seedGlobalDecision,
  seedMoment,
} from '../../test-helpers/data-stores/psql/classifier-comparison-seeding.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  enableQueryCapture,
  stopTestQueryCapture,
  type CapturedTestQuery,
} from '../../test-helpers/query-capture.mts'
import { explainCapturedTestQuery } from '../../test-helpers/query-plans.mts'
import { getClassifierHumanVoteComparison } from './get-classifier-human-vote-comparison.mts'
import type { ClassifierHumanVoteComparisonOptions } from './human-vote-comparison-types.mts'

const WINDOW = { from: seedMoment(-6), to: seedMoment(6) }
const PLAN_MODES = ['force_custom_plan', 'force_generic_plan'] as const
const { classifier, community, post, rssFeedItem } = COMPARISON_BATCH_INDEXES
const FILTERS = ['classifier', 'community', 'post', 'rssFeedItem'] as const
// The fixture is a few thousand rows, where stock planner costs rightly pick a sequential or
// bitmap-then-sort plan, and the choice flips with the size of the table around it. The skew also
// breaks the planner's independence assumption between the post and classifier filters (it
// estimates a few hundred rows where the post holds the classifier's whole window). Pricing index
// probes below a sequential read makes the id-bounded walk the decisive choice, so the verdict is
// stable. It pins determinism; it does not show which plan production's stock costs pick.
const PLAN_SETTINGS = { random_page_cost: '0.1' } as const
const ALLOWED_INDEXES = {
  classifier: [classifier],
  community: [community, classifier],
  post: [post, classifier],
  rssFeedItem: [rssFeedItem, classifier],
} as const

async function activatedFixture() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  return fixture
}

async function captureReportQuery(
  options: ClassifierHumanVoteComparisonOptions,
): Promise<CapturedTestQuery> {
  enableQueryCapture()
  let captured: CapturedTestQuery | undefined
  try {
    await getClassifierHumanVoteComparison(options)
  } finally {
    captured = stopTestQueryCapture().find(query =>
      query.text.includes('/* classifierHumanVoteComparison */'),
    )
  }
  if (!captured) throw new Error('The comparison query was not captured')
  return captured
}

describe('classifier human vote comparison query plan', () => {
  const captured = {} as Record<(typeof FILTERS)[number], CapturedTestQuery>

  beforeAll(async () => {
    const target = await activatedFixture()
    const bystander = await activatedFixture()
    // The target classifier has more batches in the window than the cap and older batches before
    // it, and another classifier fills the same window; the report may read none of the excess.
    await insertCompletedEmptyBatches(
      target,
      getClassifiersWorkLimit('comparison_max_batches') + 100,
      seedMoment(0),
    )
    await insertCompletedEmptyBatches(target, 400, seedMoment(-12))
    await insertCompletedEmptyBatches(bystander, 2000, seedMoment(1))
    for (const [index, probability] of [0.1, 0.5, 0.9].entries()) {
      await seedGlobalDecision(target, { probability, at: seedMoment(2 + index / 100) })
    }
    await analyzeClassifierComparisonPlanTables()
    const base = { classifierId: target.classifierId, ...WINDOW }
    captured.classifier = await captureReportQuery(base)
    captured.community = await captureReportQuery({ ...base, communityId: target.communityId })
    captured.post = await captureReportQuery({ ...base, postId: target.postId })
    captured.rssFeedItem = await captureReportQuery({
      ...base,
      rssFeedItemId: target.rssFeedItemId,
    })
  })

  describe.each(PLAN_MODES)('in %s mode', planCacheMode => {
    it.each(FILTERS)('bounds the batch scan by the id window with the %s filter', async filter => {
      const plan = await explainCapturedTestQuery(
        `classifier-comparison-${filter}`,
        captured[filter],
        planCacheMode,
        analyzeClassifierComparisonPlanTables,
        PLAN_SETTINGS,
      )

      const scans = summarizeComparisonBatchScans(plan)

      // One scan per report, over an index that leads with a filter column (never an id-first
      // unique index, which would walk every classifier's batches), bounded above and below by the
      // id window and stopping at the batch cap however many other batches the table holds.
      expect(scans.length).toBeGreaterThan(0)
      for (const scan of scans) {
        expect(scan.nodeType).toBe('Index Scan')
        expect(ALLOWED_INDEXES[filter]).toContain(scan.indexName)
        expect(scan.condition).toMatch(/\bid >= /)
        expect(scan.condition).toMatch(/\bid < /)
        expect(scan.work).toBeLessThanOrEqual(getClassifiersWorkLimit('comparison_max_batches') + 1)
      }
    })
  })
})
