import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCapturedQueries } from '@data-stores/psql'
import { writeAnnotatedSelectProbe } from '@voucha/test-helpers/data-stores/psql/annotated-select-probe'
import { registerScenarioContract } from './plan-expectations.mts'
import {
  assertScenarioManifest,
  getResults,
  OUTPUT_DIR,
  prepareOutputDir,
  runAndCapture,
  writeResults,
} from './run-support.mts'
import { getScenarioFailures } from './scenario-failures.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

function capturedStatements() {
  return getCapturedQueries().map(({ text, values }) => ({ text, values }))
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
    const before = getResults().length
    await runAndCapture('post-search-new', async () => {
      await writeAnnotatedSelectProbe()
    })
    expect(capturedStatements()).toEqual([{ text: '/* postSearch */ SELECT 1', values: [] }])
    const explained = getResults().slice(before)
    expect(explained.map(result => result.query_text)).toEqual(['/* postSearch */ SELECT 1'])
    expect(explained.map(result => result.plan_cache_mode)).toEqual(['auto'])
  })

  it('explains compare mode as forced custom and generic plans', async () => {
    vi.stubEnv('EXPLAIN_PLAN_CACHE_MODE', 'compare')
    const before = getResults().length
    await runAndCapture('post-search-new', async () => {
      await writeAnnotatedSelectProbe()
    })
    expect(capturedStatements()).toEqual([{ text: '/* postSearch */ SELECT 1', values: [] }])
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

describe('writeResults', () => {
  it('persists a gate-rejected captured plan', async () => {
    vi.stubEnv('EXPLAIN_PLAN_CACHE_MODE', '')
    registerScenarioContract('membership-refunds-already-refunded-batch', {
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
    const before = getResults().length
    const beforeFailures = getScenarioFailures().length
    await runAndCapture('membership-refunds-already-refunded-batch', async () => {
      await writeAnnotatedSelectProbe()
    })
    const explained = getResults().slice(before)
    expect(explained.map(result => result.query_text)).toEqual(['/* postSearch */ SELECT 1'])
    expect(getScenarioFailures().length).toBe(beforeFailures + 1)
    expect(() => {
      throw getScenarioFailures().at(-1)?.error
    }).toThrow(
      'postSearch must use index(es) idx_membership_refunds__stripe_charge_id, idx_membership_refunds__stripe_payment_intent_id',
    )
    prepareOutputDir()
    const existing = new Set(readdirSync(OUTPUT_DIR))
    try {
      writeResults()
      const resultsName = readdirSync(OUTPUT_DIR).find(
        name => !existing.has(name) && name.startsWith('results-'),
      )
      expect(resultsName).toEqual(expect.stringMatching(/^results-/))
      const written = JSON.parse(readFileSync(join(OUTPUT_DIR, resultsName ?? ''), 'utf8')) as {
        results: { query_text: string }[]
      }
      expect(written.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ query_text: '/* postSearch */ SELECT 1' }),
        ]),
      )
    } finally {
      for (const name of readdirSync(OUTPUT_DIR)) {
        if (!existing.has(name)) rmSync(join(OUTPUT_DIR, name))
      }
    }
  })
})
