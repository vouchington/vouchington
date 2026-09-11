import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const noMistakes = vi.hoisted(() => ({
  ciTopologyImpact: vi.fn<typeof import('no-mistakes').ciTopologyImpact>(),
}))

vi.mock<typeof import('no-mistakes')>(
  import('no-mistakes'),
  () =>
    ({
      ...noMistakes,
      default: noMistakes as unknown as typeof import('no-mistakes'),
    }) as unknown as typeof import('no-mistakes'),
)

import { allJobs, nonTopologyFullJobs } from './ci-select.mts'
import { selectTopology } from './ci-select-topology.mts'

describe('non-topology forced-full routing', () => {
  beforeEach(() => {
    noMistakes.ciTopologyImpact.mockReset()
  })

  it('preserves full topology outputs after a global fallback', () => {
    const selector = readFileSync(new URL('./ci-select.mts', import.meta.url), 'utf8')
    expect(selector.indexOf('plan = await planTests')).toBeLessThan(
      selector.indexOf("labels.includes('vitest:full')"),
    )
    expect(selector).toContain('fullCi: true')
    expect(selector).toContain('fullOut(reason, reason, topology)')
  })

  it('preserves configuration consumers the dependency graph cannot observe', () => {
    expect(nonTopologyFullJobs(['integration-tests/web/helpers/fixture.mts'])).toEqual(
      new Set(['test-web-api', 'test-web-integration']),
    )
    expect(nonTopologyFullJobs(['.trivyignore.yaml'])).toEqual(new Set(['test-tooling']))
  })

  it('keeps dynamically-read shell policy sources on the tooling job', () => {
    expect(nonTopologyFullJobs(['scripts/release.sh'])).toEqual(new Set(['test-tooling']))
    expect(nonTopologyFullJobs(['dev/initialize'])).toEqual(new Set(['test-tooling']))
    expect(nonTopologyFullJobs(['dev/deleted-shell-entrypoint'])).toEqual(new Set(['test-tooling']))
  })

  it.each([
    '.github/workflows/ci.yml',
    '.github/workflows/ci-select-vitest.yml',
    '.github/actions/ci-example/action.yml',
    '.github/ci-path-filters.yml',
    '.github/ci-runtime-path-filters.yml',
  ])('keeps CI control surface %s as a full Vitest trigger', path => {
    expect(nonTopologyFullJobs([path])).toEqual(new Set(allJobs()))
  })

  it.each([
    '.github/workflows/ci-select-vitest.yml',
    '.github/actions/ci-example/action.yml',
    '.github/ci-path-filters.yml',
  ])('promotes CI control surface %s to full CI without live analysis', async path => {
    const outputs = new Map<string, string>()
    const selection = await selectTopology({
      changedFiles: [path],
      worktreeRoot: process.cwd(),
      allVitestJobs: allJobs(),
      writeOutput: (key, value) => outputs.set(key, value),
    })

    expect(selection).toMatchObject({
      fullCi: true,
      fullJobs: new Set(allJobs()),
      reason: 'CI control surface changed',
    })
    expect(outputs.get('full-ci')).toBe('true')
    expect(noMistakes.ciTopologyImpact).not.toHaveBeenCalled()
  })
})
