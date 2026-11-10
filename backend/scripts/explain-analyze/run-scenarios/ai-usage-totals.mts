import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getCommunityAiCostTotals } from '@services/ai-usage/totals'
import { getPaginationLimits } from '@services/pagination'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  AI_USAGE_TOTAL_COMMUNITY_COUNT,
  AI_USAGE_TOTAL_RAW_ROWS,
  seedAiUsageTotals,
} from '../seed-data/ai-usage-totals.mts'

/** One staff page. LIMIT applies after the aggregate, so the scan is the retained tail. */
export async function runAiUsageTotalsScenarios(): Promise<void> {
  await seedAiUsageTotals()
  await write(`/* seedAiUsageTotals:analyze */ VACUUM (ANALYZE) ai_usage_records,
    ai_usage_community_monthly_rollups, communities`)
  const limit = getPaginationLimits(25, 100).default
  registerScenarioContract('ai-usage-totals-page', {
    seededRows: {
      ai_usage_records: AI_USAGE_TOTAL_RAW_ROWS,
      ai_usage_community_monthly_rollups: AI_USAGE_TOTAL_COMMUNITY_COUNT,
    },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'ai_usage_records', max: AI_USAGE_TOTAL_RAW_ROWS },
      {
        kind: 'maxProcessedRows',
        relation: 'ai_usage_community_monthly_rollups',
        max: AI_USAGE_TOTAL_COMMUNITY_COUNT,
      },
    ],
    crossPartition: { ai_usage_records: 'Lifetime totals sum the whole retained raw tail.' },
  })
  await runAndCapture('ai-usage-totals-page', async () => {
    const page = await getCommunityAiCostTotals({ limit })
    assert.equal(page.results.length, limit)
    assert.equal(page.page_info.has_next_page, true)
    assert.ok(page.results.every(row => row.request_count === 60))
  })
}
