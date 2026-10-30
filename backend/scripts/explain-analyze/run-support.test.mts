import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCapturedQueries, type ExplainResult } from '@data-stores/psql'
import { writeAnnotatedSelectProbe } from '@voucha/test-helpers/data-stores/psql/annotated-select-probe'
import { writeExplainResultFile, writeSecondPassResults } from './capture-passes.mts'
import { gateExplainResult } from './plan-gates.mts'
import { getScenarioContract, registerScenarioContract } from './plan-expectations.mts'
import { assertScenarioManifest, getResults, runAndCapture } from './run-support.mts'
import { getScenarioFailures } from './scenario-failures.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

function capturedStatements() {
  return getCapturedQueries().map(({ text, values }) => ({ text, values }))
}

function explainResultsAfter(before: number): ExplainResult[] | undefined {
  const added = getResults().slice(before)
  if (added.length > 0) return added
  const error = getScenarioFailures().at(-1)?.error
  expect(() => {
    if (error instanceof Error) throw error
    throw new Error('missing explain failure')
  }).toThrow('EXPLAIN requires SET privilege on track_functions')
  return undefined
}

function recordedScenarioError(run: () => Promise<void>): Promise<void> {
  const seen: unknown[] = []
  const errorLog = vi.spyOn(console, 'error').mockImplementation(value => {
    seen.push(value)
  })
  return run().finally(() => {
    errorLog.mockRestore()
    const failure = seen.find(value => value instanceof Error)
    if (failure instanceof Error) throw failure
  })
}

describe('EXPLAIN scenario manifest', () => {
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
})

describe('EXPLAIN query capture', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('rejects scenarios that capture no SQL', async () => {
    await expect(
      recordedScenarioError(() => runAndCapture('post-search-new', async () => {})),
    ).rejects.toThrow('post-search-new captured no queries')
  })

  it('rejects an unknown plan cache mode before explaining', async () => {
    vi.stubEnv('EXPLAIN_PLAN_CACHE_MODE', 'invalid')
    await expect(
      recordedScenarioError(() =>
        runAndCapture('post-search-new', async () => {
          await writeAnnotatedSelectProbe()
        }),
      ),
    ).rejects.toThrow('Invalid EXPLAIN_PLAN_CACHE_MODE: "invalid"')
  })

  it('accepts captured SELECT 1 and explains it in auto mode', async () => {
    vi.stubEnv('EXPLAIN_PLAN_CACHE_MODE', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = getResults().length
    await runAndCapture('post-search-new', async () => {
      await writeAnnotatedSelectProbe()
    })
    expect(capturedStatements()).toEqual([{ text: '/* postSearch */ SELECT 1', values: [] }])
    const explained = explainResultsAfter(before)
    if (!explained) return
    expect(explained.map(result => result.query_text)).toEqual(['/* postSearch */ SELECT 1'])
    expect(explained.map(result => result.plan_cache_mode)).toEqual(['auto'])
  })

  it('explains compare mode as forced custom and generic plans', async () => {
    vi.stubEnv('EXPLAIN_PLAN_CACHE_MODE', 'compare')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = getResults().length
    await runAndCapture('post-search-new', async () => {
      await writeAnnotatedSelectProbe()
    })
    expect(capturedStatements()).toEqual([{ text: '/* postSearch */ SELECT 1', values: [] }])
    const explained = explainResultsAfter(before)
    if (!explained) return
    expect(explained.map(result => result.query_text)).toEqual([
      '/* postSearch */ SELECT 1',
      '/* postSearch */ SELECT 1',
    ])
    expect(explained.map(result => result.plan_cache_mode)).toEqual([
      'force_custom_plan',
      'force_generic_plan',
    ])
  })
})

function ensureContract(
  id: 'entity-relations-newest' | 'membership-refunds-already-refunded-batch',
  contract: Parameters<typeof registerScenarioContract>[1],
) {
  const existing = getScenarioContract(id)
  const same = JSON.stringify(existing.expectations) === JSON.stringify(contract.expectations)
  if (!same) registerScenarioContract(id, contract)
}

function gatedResult(name: string, node: Record<string, unknown>): ExplainResult {
  return {
    name,
    query_text: '',
    plan: { Plan: { 'Actual Rows': 1, ...node } },
    execution_time_ms: 0,
    planning_time_ms: 0,
    timestamp: '2024-01-01T00:00:00.000Z',
    scenario_id: name,
  }
}

describe('collectAndGate', () => {
  it('collects a result before its plan-shape gate throws', () => {
    ensureContract('entity-relations-newest', {
      expectations: [{ kind: 'custom', name: 'relationListingOrder' }],
    })
    const failing = gatedResult('entity-relations-newest', { 'Node Type': 'Sort' })
    const kept: ExplainResult[] = []
    expect(() => gateExplainResult(failing, kept)).toThrow(
      'entity-relations-newest must use relation index order without an explicit Sort',
    )
    expect(kept).toContainEqual(failing)
  })
})

describe('writeResults', () => {
  it('persists a gate-rejected result to the output artifact', () => {
    ensureContract('membership-refunds-already-refunded-batch', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: [
            'idx_membership_refunds__stripe_charge_id',
            'idx_membership_refunds__stripe_payment_intent_id',
          ],
        },
      ],
    })
    const failing = gatedResult('membership-refunds-already-refunded-batch', {
      'Node Type': 'Seq Scan',
    })
    const kept: ExplainResult[] = []
    expect(() => gateExplainResult(failing, kept)).toThrow(
      'membership-refunds-already-refunded-batch must use index(es) idx_membership_refunds__stripe_charge_id, idx_membership_refunds__stripe_payment_intent_id',
    )
    const dir = mkdtempSync(join(tmpdir(), 'explain-results-'))
    const outputPath = join(dir, 'results-gate.json')
    try {
      writeExplainResultFile(outputPath, kept, [])
      writeSecondPassResults(outputPath, [], [])
      expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toMatchObject({
        results: [failing],
        completedScenarioIds: [],
      })
      expect(JSON.parse(readFileSync(join(dir, 'repeat-gate.json'), 'utf8'))).toMatchObject({
        results: [],
        completedScenarioIds: [],
      })
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
})
