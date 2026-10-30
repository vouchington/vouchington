import { afterEach, describe, expect, it, vi } from 'vitest'
import { write } from '@data-stores/psql'
import { assertScenarioManifest, runAndCapture } from './run-support.mts'
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
          await write('/* postSearch */ SELECT 1')
        }),
      ),
    ).rejects.toThrow('Invalid EXPLAIN_PLAN_CACHE_MODE: "invalid"')
  })
})
