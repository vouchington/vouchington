import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'

function result(
  node: Record<string, unknown>,
  query = 'WITH requested_posts AS (SELECT id) SELECT id FROM requested_posts',
): ExplainResult {
  return {
    name: 'capturedQuery',
    scenario_id: 'post-metrics-batch',
    query_text: query,
    plan: { Plan: { 'Node Type': 'Result', 'Actual Rows': 1, 'Actual Loops': 1, Plans: [node] } },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

async function loadGates() {
  vi.resetModules()
  const gates = await import('./plan-gates.mts')
  const expectations = await import('./plan-expectations.mts')
  return { ...gates, ...expectations }
}

describe('no sequential scan expectation', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('rejects a scan that reads rows and ignores a different query', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
    registerScenarioContract('post-metrics-batch', {
      expectations: [
        {
          kind: 'noSeqScan',
          relation: 'membership_verifications',
          queryContains: 'requested_posts',
        },
        { kind: 'maxProcessedRows', relation: 'membership_verifications', max: 1 },
      ],
      seededRows: { membership_verifications: 1 },
    })
    const indexScan = {
      'Node Type': 'Index Scan',
      'Relation Name': 'membership_verifications',
      'Index Name': 'membership_verifications_pkey',
      'Actual Rows': 1,
      'Actual Loops': 1,
    }
    expect(() => assertRequiredPlanShape(result(indexScan))).not.toThrow()
    expect(() =>
      assertRequiredPlanShape(result({ ...indexScan, 'Node Type': 'Seq Scan' })),
    ).toThrow('sequentially scanned membership_verifications')
    expect(() =>
      assertRequiredPlanShape(result({ ...indexScan, 'Node Type': 'Seq Scan', 'Actual Rows': 0 })),
    ).not.toThrow()
    expect(() =>
      assertRequiredPlanShape(result({ ...indexScan, 'Node Type': 'Seq Scan' }, 'SELECT 1')),
    ).not.toThrow()
  })
})
