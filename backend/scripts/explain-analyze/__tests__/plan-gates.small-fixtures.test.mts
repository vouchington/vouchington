import { describe, expect, it, vi } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'

describe('indexed setup fixtures', () => {
  it.each([
    ['agent_moderations', 'agent_moderations__default'],
    ['copyright_notice_evidence_artifacts', 'copyright_notice_evidence_artifacts'],
    ['copyright_notice_email_intakes', 'copyright_notice_email_intakes'],
    ['copyright_notice_email_intake_notice_links', 'copyright_notice_email_intake_notice_links'],
  ])('keeps the %s sequential-scan guard with a smaller fixture', async (relation, leaf) => {
    vi.resetModules()
    const { registerScenarioContract } = await import('../plan-expectations.mts')
    const { assertRequiredPlanShape } = await import('../plan-gates.mts')
    registerScenarioContract('post-search-new', {
      expectations: [],
      forbidSequentialScans: [relation],
      seededRows: { [relation]: 1000 },
    })
    const scan = {
      'Node Type': 'Seq Scan',
      'Relation Name': leaf,
      'Actual Rows': 1,
      'Actual Loops': 1,
    }
    const result: ExplainResult = {
      name: 'fixtureProbe',
      scenario_id: 'post-search-new',
      query_text: 'SELECT id',
      plan: { Plan: { 'Node Type': 'Result', 'Actual Rows': 1, Plans: [scan] } },
      execution_time_ms: 1,
      planning_time_ms: 1,
      timestamp: '2026-01-01T00:00:00Z',
    }
    expect(() => assertRequiredPlanShape(result)).toThrow(`sequentially scanned ${relation}`)
    scan['Actual Rows'] = 0
    expect(() => assertRequiredPlanShape(result)).not.toThrow()
    scan['Actual Rows'] = 1
    scan['Node Type'] = 'Index Scan'
    expect(() => assertRequiredPlanShape(result)).not.toThrow()
  })

  it.each(['copyright_notice_evidence_artifacts', 'copyright_notice_email_intakes'])(
    'keeps the existing small-cohort override for %s',
    async relation => {
      vi.resetModules()
      const { registerScenarioContract } = await import('../plan-expectations.mts')
      const { assertRequiredPlanShape } = await import('../plan-gates.mts')
      registerScenarioContract('post-search-new', {
        expectations: [],
        seededRows: { [relation]: 1000 },
      })
      const result: ExplainResult = {
        name: 'smallProbe',
        scenario_id: 'post-search-new',
        query_text: 'SELECT id',
        plan: {
          Plan: {
            'Node Type': 'Seq Scan',
            'Relation Name': relation,
            'Actual Rows': 1,
            'Actual Loops': 1,
          },
        },
        execution_time_ms: 1,
        planning_time_ms: 1,
        timestamp: '2026-01-01T00:00:00Z',
      }
      expect(() => assertRequiredPlanShape(result)).not.toThrow()
    },
  )
  it.each(['agent_moderations', 'copyright_notice_evidence_artifacts'])(
    'inherits the indexed-fixture requirement for %s',
    async relation => {
      vi.resetModules()
      const { registerScenarioContract } = await import('../plan-expectations.mts')
      const { assertRequiredPlanShape } = await import('../plan-gates.mts')
      registerScenarioContract('post-search-new', { expectations: [] })
      const result: ExplainResult = {
        name: 'inheritedProbe',
        scenario_id: 'post-search-new',
        query_text: 'SELECT id',
        plan: {
          Plan: {
            'Node Type': 'Seq Scan',
            'Relation Name': relation,
            'Actual Rows': 1,
            'Actual Loops': 1,
          },
        },
        execution_time_ms: 1,
        planning_time_ms: 1,
        timestamp: '2026-01-01T00:00:00Z',
      }
      expect(() => assertRequiredPlanShape(result)).toThrow(`sequentially scanned ${relation}`)
    },
  )
})
