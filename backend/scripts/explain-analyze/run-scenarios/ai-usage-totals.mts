import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { refreshMaterializedView } from '@data-stores/psql/migration-runner/refresh-materialized-view'
import { getCommunityAiCostTotals } from '@services/ai-usage/totals'
import { encodeCursor } from '@modules/pagination'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { aiUsageTotalsReadCases } from './ai-usage-totals-cases.mts'
import {
  AI_USAGE_TOTAL_COMMUNITY_COUNT,
  AI_USAGE_TOTAL_RAW_ROWS,
  aiUsageTotalsCommunityId,
  seedAiUsageTotals,
} from '../seed-data/ai-usage-totals.mts'

const VIEW = 'mv_ai_usage_community_totals'

/** Seeds both sources, fills the view the way the scheduled refresh does, then captures both sides. */
export async function runAiUsageTotalsScenarios(): Promise<void> {
  await seedAiUsageTotals()
  // Settle seed row versions just as the ordinary seed runner does, before the first refresh.
  await write(`/* seedAiUsageTotals:analyze */ VACUUM (ANALYZE) ai_usage_records,
    ai_usage_community_monthly_rollups, communities`)
  await refreshMaterializedView(VIEW)
  await write(`/* seedAiUsageTotals:analyzeView */ ANALYZE ${VIEW}`)
  await runRefreshScenario()
  for (const scenario of aiUsageTotalsReadCases()) {
    registerScenarioContract(scenario.id, {
      seededRows: { [VIEW]: AI_USAGE_TOTAL_COMMUNITY_COUNT },
      forbidSequentialScans: [VIEW, 'communities'],
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_mv_ai_usage_community_totals__ranking', 'communities_pkey'],
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: VIEW, max: scenario.limit + 1 },
        { kind: 'maxProcessedRows', relation: 'communities', max: scenario.limit + 1 },
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: three fixed cursor shapes independently capture ranked-page plans
    await runAndCapture(scenario.id, async () => {
      const page = await getCommunityAiCostTotals(scenario.options)
      const zeroCost = scenario.id === 'ai-usage-totals-zero-cost'
      assert.equal(page.results.length, zeroCost ? 9 : scenario.limit)
      assert.equal(page.page_info.has_next_page, !zeroCost)
      assert.ok(page.results.every(row => row.request_count === 60))
      if (scenario.id === 'ai-usage-totals-first') {
        const aboveInt64Max = await getCommunityAiCostTotals({
          after: encodeCursor({
            total_cost_microunits: '99999999999999999999999999999999999999999999999999',
            id: aiUsageTotalsCommunityId(0),
          }),
        })
        assert.deepEqual(aboveInt64Max, page)
      }
    })
  }
}

/** The refresh runs the view's defining query over the raw tail and every monthly rollup. */
async function runRefreshScenario(): Promise<void> {
  registerScenarioContract('mv-ai-usage-community-totals-refresh', {
    seededRows: { ai_usage_records: AI_USAGE_TOTAL_RAW_ROWS },
    expectations: [
      // The seeded raw tail plus other test usage rows, with headroom.
      {
        kind: 'maxProcessedRows',
        relation: 'ai_usage_records',
        max: AI_USAGE_TOTAL_RAW_ROWS * 1.2,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'ai_usage_community_monthly_rollups',
        max: AI_USAGE_TOTAL_COMMUNITY_COUNT * 1.2,
      },
    ],
    crossPartition: { ai_usage_records: 'Lifetime totals sum the whole retained raw tail.' },
  })
  const { rows } = await read<{ definition: string }>(
    `/* explainMaterializedViewDefinition */ SELECT pg_get_viewdef($1::regclass) AS definition`,
    [VIEW],
  )
  const definition = rows[0]?.definition
  if (!definition) throw new Error(`Missing materialized view ${VIEW}`)
  await runAndCapture('mv-ai-usage-community-totals-refresh', async () => {
    const result = await read(`/* mv-ai-usage-community-totals-refresh */ ${definition}`)
    if (result.rows.length < AI_USAGE_TOTAL_COMMUNITY_COUNT)
      throw new Error(`Short ${VIEW} defining query`)
  })
}
