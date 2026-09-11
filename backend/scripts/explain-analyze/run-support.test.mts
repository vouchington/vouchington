import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import {
  OUTPUT_DIR,
  assertCapturedQueries,
  assertScenarioManifest,
  assertSeedAnchorMatches,
  collectAndGate,
  getExplainPlanCacheModes,
  getResults,
  prepareOutputDir,
  resetResults,
  writeResults,
} from './run-support.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

describe('EXPLAIN query capture', () => {
  it('rejects scenarios that capture no SQL', () => {
    expect(() => assertCapturedQueries('empty-scenario', [])).toThrow(
      'empty-scenario captured no queries',
    )
  })

  it('accepts scenarios that capture SQL', () => {
    expect(() =>
      assertCapturedQueries('scenario', [{ text: 'SELECT 1', values: [] }]),
    ).not.toThrow()
  })

  it('rejects incomplete scenario manifests', () => {
    expect(() => assertScenarioManifest(['first', 'replacement'], ['first', 'second'])).toThrow(
      'missing=[second] unexpected=[replacement]',
    )
    expect(() => assertScenarioManifest(['first', 'first'], ['first'])).toThrow(
      'duplicates=[first]',
    )
    expect(() =>
      assertScenarioManifest(EXPLAIN_SCENARIO_MANIFEST, EXPLAIN_SCENARIO_MANIFEST),
    ).not.toThrow()
  })

  it('expands compare mode to forced custom and generic plans', () => {
    expect(getExplainPlanCacheModes('compare')).toEqual(['force_custom_plan', 'force_generic_plan'])
    expect(getExplainPlanCacheModes(undefined)).toEqual(['auto'])
    expect(() => getExplainPlanCacheModes('invalid')).toThrow('EXPLAIN_PLAN_CACHE_MODE')
  })
})

describe('collectAndGate', () => {
  it('collects a result before its plan-shape gate throws', () => {
    const failing: ExplainResult = {
      name: 'entity-relations-newest',
      query_text: '',
      plan: { Plan: { 'Node Type': 'Sort', 'Actual Rows': 1 } },
      execution_time_ms: 0,
      planning_time_ms: 0,
      timestamp: '2024-01-01T00:00:00.000Z',
      scenario_id: 'entity-relations-newest',
    }

    expect(() => collectAndGate(failing)).toThrow(
      'entity-relations-newest must use relation index order without an explicit Sort',
    )
    expect(getResults()).toContainEqual(failing)
  })
})

describe('assertSeedAnchorMatches', () => {
  it('rejects a seed anchor post id absent from the database', async () => {
    const missingPostId = randomUUID()
    await expect(assertSeedAnchorMatches(missingPostId)).rejects.toThrow(
      `Seed anchor post ${missingPostId} not found`,
    )
  })
})

describe('writeResults', () => {
  beforeEach(() => {
    resetResults()
  })

  it('persists a gate-rejected result to the output artifact', () => {
    prepareOutputDir()
    const before = new Set(readdirSync(OUTPUT_DIR))
    const failing: ExplainResult = {
      name: 'membership-refunds-already-refunded-batch',
      query_text: '',
      plan: { Plan: { 'Node Type': 'Seq Scan', 'Actual Rows': 1 } },
      execution_time_ms: 0,
      planning_time_ms: 0,
      timestamp: '2024-01-01T00:00:00.000Z',
      scenario_id: 'membership-refunds-already-refunded-batch',
    }

    expect(() => collectAndGate(failing)).toThrow(
      'membership-refunds-already-refunded-batch (membership-refunds-already-refunded-batch) must use index(es) idx_mrefunds__stripe_charge_id, idx_mrefunds__stripe_payment_intent_id',
    )

    writeResults()

    const newFile = readdirSync(OUTPUT_DIR).find(name => !before.has(name))
    if (!newFile) throw new Error('writeResults did not create a new output file')
    const written = JSON.parse(readFileSync(join(OUTPUT_DIR, newFile), 'utf8'))
    expect(written).toContainEqual(failing)
    rmSync(join(OUTPUT_DIR, newFile))
  })
})
