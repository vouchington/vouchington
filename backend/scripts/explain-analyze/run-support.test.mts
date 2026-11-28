import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeCapturedStatement } from '@voucha/test-helpers/query-capture'
import { getResults, runAndCapture } from './run-support.mts'
import { assertScenarioManifest } from './scenario-manifest-check.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

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

describe('writeResults', () => {
  it('persists a gate-rejected captured plan', async () => {
    vi.resetModules()
    vi.stubEnv('EXPLAIN_PLAN_CACHE_MODE', '')
    const captured = await import('@voucha/test-helpers/query-capture')
    const expectations = await import('./plan-expectations.mts')
    const failures = await import('./scenario-failures.mts')
    const support = await import('./run-support.mts')
    expectations.registerScenarioContract('membership-refunds-already-refunded-batch', {
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
    await support.runAndCapture('membership-refunds-already-refunded-batch', async () => {
      await captured.executeCapturedStatement('/* postSearch */ SELECT 1')
    })
    const failing = support.getResults().at(-1)
    expect(failing?.query_text).toBe('/* postSearch */ SELECT 1')
    let recorded: unknown
    expect(() => {
      try {
        failures.assertNoScenarioFailures()
      } catch (err) {
        recorded = err
        throw err
      }
    }).toThrow(
      '1 EXPLAIN scenario failure(s) [membership-refunds-already-refunded-batch] and 0 run check failure(s)',
    )
    expect(() => {
      throw (recorded as AggregateError).errors[0]
    }).toThrow(
      'postSearch must use index(es) idx_membership_refunds__stripe_charge_id, idx_membership_refunds__stripe_payment_intent_id',
    )
    const outputDir = mkdtempSync(join(tmpdir(), 'explain-results-'))
    try {
      support.prepareOutputDir(outputDir)
      support.writeResults(outputDir)
      const files = readdirSync(outputDir)
      expect(files).toHaveLength(2)
      const resultFile = files.find(name => name.startsWith('results-'))
      if (!resultFile) throw new Error('writeResults did not create a new result file')
      const repeatFile = resultFile.replace(/^results-/, 'repeat-')
      const written = JSON.parse(readFileSync(join(outputDir, resultFile), 'utf8'))
      expect(written).toMatchObject({ results: [failing], completedScenarioIds: [] })
      const repeated = JSON.parse(readFileSync(join(outputDir, repeatFile), 'utf8'))
      expect(repeated).toMatchObject({ results: [], completedScenarioIds: [] })
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })
})

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
          await executeCapturedStatement('/* postSearch */ SELECT 1')
        }),
      ),
    ).rejects.toThrow('Invalid EXPLAIN_PLAN_CACHE_MODE: "invalid"')
  })

  it('accepts captured SELECT 1 and explains it in auto mode', async () => {
    vi.stubEnv('EXPLAIN_PLAN_CACHE_MODE', '')
    const before = getResults().length
    await runAndCapture('post-search-new', async () => {
      await executeCapturedStatement('/* postSearch */ SELECT 1')
    })
    const explained = getResults().slice(before)
    expect(explained.map(result => result.query_text)).toEqual(['/* postSearch */ SELECT 1'])
    expect(explained.map(result => result.plan_cache_mode)).toEqual(['auto'])
  })

  it('explains compare mode as forced custom and generic plans', async () => {
    vi.stubEnv('EXPLAIN_PLAN_CACHE_MODE', 'compare')
    const before = getResults().length
    await runAndCapture('post-search-new', async () => {
      await executeCapturedStatement('/* postSearch */ SELECT 1')
    })
    const explained = getResults().slice(before)
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
