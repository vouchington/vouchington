import { beforeAll, describe, expect, it } from 'vitest'
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
  analyzePublicationFeedItemPageForTest,
  publicationPhysicalRowsWithinBudget,
} from '@voucha/test-helpers/entities/post-publication-query-plans'
import { assertPaginationPlanShape } from '../../../scripts/explain-analyze/plan-pagination-gates.mts'
import { getStoryPostRelatedUrlProjectionSourcePage } from '../story-post-related-url-projection-source.mts'

let captured: CapturedTestQuery
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
        analyzePublicationFeedItemPageForTest,
      )
      expect(publicationPhysicalRowsWithinBudget(plan, 'rss_feed_items')).toBe(100)
      assertPaginationPlanShape({
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
