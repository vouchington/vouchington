import { beforeAll, describe, expect, it } from 'vitest'
import { analyzeTestStoryUrlSourceRelations } from '../../../test-helpers/story-source-plan-queries.mts'
import {
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
  enableQueryCapture,
  stopTestQueryCapture,
  explainCapturedTestQuery,
  type CapturedTestQuery,
} from '@voucha/test-helpers'
import {
  collectPlanNodes,
  definePlanStatisticsRefresh,
} from '../../../test-helpers/query-plans.mts'
import { assertCustomPlanCheck } from '../../../scripts/explain-analyze/plan-custom-checks.mts'
import { getStoryPostRelatedUrlProjectionSourcePage } from '../story-post-related-url-projection-source.mts'

let captured: CapturedTestQuery
const analyzeStorySourcePage = definePlanStatisticsRefresh(analyzeTestStoryUrlSourceRelations)

function physicalRowsWithinBudget(plan: unknown, relation: string, budget: number): number {
  const nodes = collectPlanNodes(plan).filter(
    node =>
      node['Relation Name'] === relation ||
      String(node['Relation Name']).startsWith(`${relation}_`),
  )
  const rows = nodes.reduce(
    (total, node) =>
      total +
      (Number(node['Actual Rows'] ?? 0) +
        Number(node['Rows Removed by Filter'] ?? 0) +
        Number(node['Rows Removed by Index Recheck'] ?? 0)) *
        Number(node['Actual Loops'] ?? 1),
    0,
  )
  if (rows > budget)
    throw new Error(`${relation} scanned ${rows} physical rows: ${JSON.stringify(nodes)}`)
  return rows
}
describe('story URL source ordered index consolidation', () => {
  beforeAll(async () => {
    const story = await insertTestStory()
    const url = await insertTestUrlDirect(null, `https://story-plan-${story.id}.example.test/item`)
    if (!url) throw new Error('Expected story URL fixture')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: url.id, count: 1001 })
    enableQueryCapture()
    let queries: CapturedTestQuery[] = []
    try {
      const rows = await getStoryPostRelatedUrlProjectionSourcePage({
        storyId: story.id,
        sourceCursorId: null,
        sourceHighWaterId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        limit: 100,
      })
      if (rows.length !== 100) throw new Error('Expected one bounded story source page')
    } finally {
      queries = stopTestQueryCapture().filter(query =>
        query.text.startsWith('/* storyPostRelatedUrlProjectionSourcePage */'),
      )
    }
    if (queries.length !== 1) throw new Error('Expected one actual story source query')
    captured = queries[0]!
  })
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'preserves covering cursor reads in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'story-source-index-consolidation',
        captured,
        mode,
        analyzeStorySourcePage,
      )
      expect(physicalRowsWithinBudget(plan, 'rss_feed_items', 100)).toBe(100)
      assertCustomPlanCheck('paginationSpecial', {
        name: 'story-source-index-consolidation',
        scenario_id: 'story-post-related-url-projection-source-page',
        query_text: captured.text,
        plan,
        execution_time_ms: 0,
        planning_time_ms: 0,
        timestamp: new Date().toISOString(),
      })
    },
  )
})
