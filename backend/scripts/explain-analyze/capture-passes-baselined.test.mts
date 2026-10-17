import { describe, expect, it, vi } from 'vitest'
import type { explainAnalyze } from '@data-stores/psql'
import { probeBaselinedScans, type Capture } from './capture-passes.mts'
import type { ProbedExplainResult } from './seq-scan-ties.mts'

const input: Capture = {
  name: 'baselined-index-lookup',
  text: '/* baselinedIndexLookup */ SELECT 1',
  values: [],
  scenarioId: 'post-search-new',
  captureIndex: 0,
  planCacheMode: 'auto',
  localSettings: { work_mem: '8MB' },
}
const identity = 'post-search-new|0|baselined-index-lookup|auto'
const baseline = { [identity]: ['posts'] }

function result(): ProbedExplainResult {
  return {
    name: input.name,
    scenario_id: input.scenarioId,
    capture_index: 0,
    plan_cache_mode: 'auto',
    query_text: input.text,
    plan: {},
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-10-17T00:00:00.000Z',
  }
}

function planWith(nodeType: string) {
  return vi.fn<typeof explainAnalyze>().mockResolvedValue({
    ...result(),
    plan: {
      Plan: {
        'Node Type': 'Limit',
        'Total Cost': 150,
        Plans: [{ 'Node Type': nodeType, 'Relation Name': 'posts__default', 'Total Cost': 120 }],
      },
    },
  })
}

describe('baselined scan probe', () => {
  it('plans a skipped baselined scan with every index path disabled', async () => {
    const plan = planWith('Seq Scan')
    const captured = result()
    await probeBaselinedScans(input, captured, [], plan, baseline)
    expect(captured.forced_seq_scans).toEqual({ posts: { total_cost: 150, scan_cost: 120 } })
    expect(plan).toHaveBeenCalledWith(input.name, input.text, input.values, {
      localSettings: {
        work_mem: '8MB',
        enable_indexscan: 'off',
        enable_bitmapscan: 'off',
        enable_indexonlyscan: 'off',
      },
      planCacheMode: 'auto',
      planOnly: true,
    })
  })

  it('records nothing when the forced plan does not reproduce the scan', async () => {
    const captured = result()
    await probeBaselinedScans(input, captured, [], planWith('Index Scan'), baseline)
    expect(captured.forced_seq_scans).toBeUndefined()
  })

  it('does not plan when the scan was observed or is not baselined', async () => {
    const plan = planWith('Seq Scan')
    await probeBaselinedScans(input, result(), ['posts'], plan, baseline)
    await probeBaselinedScans(input, result(), [], plan, {})
    expect(plan).not.toHaveBeenCalled()
  })
})
