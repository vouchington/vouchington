import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'
import {
  primaryPathFilters,
  runtimePathFilters,
} from '../test-helpers/path-filter-test-fixtures.mts'

function filterMatches(globs: string[], path: string, every: boolean) {
  const match = (glob: string) => picomatch.isMatch(path, glob)
  return every ? globs.every(match) : globs.some(match)
}

describe('bounded runner imported helper coverage', () => {
  it('selects every consumer gate that selects the entrypoint', () => {
    for (const [filters, every] of [
      [primaryPathFilters, false],
      [runtimePathFilters, true],
    ] as const) {
      const consumers = Object.entries(filters).filter(([, globs]) =>
        filterMatches(globs, 'ci/run-bounded.py', every),
      )
      expect(consumers.length).toBeGreaterThan(0)
      const missing = consumers.filter(
        ([, globs]) => !filterMatches(globs, 'ci/run_bounded_process.py', every),
      )
      expect(missing.map(([name]) => name)).toEqual([])
    }
  })
})
