import { execFileSync } from 'node:child_process'

import {
  coverageDisposition,
  findMissingCoverage,
  loadCoverageConfig,
  type DiffLines,
  type LcovData,
} from 'coverage-check'
import { matchRule } from 'coverage-check/src/rules.mts'
import { describe, expect, it } from 'vitest'

import { coverageConfigForScope } from '../test-helpers/vitest-config/coverage-config.mts'

const RULES_PATH = '.coverage-rules.yml'

function repoFiles(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
}

function reachableFiles(): string[] {
  const { rules, scope } = loadCoverageConfig(RULES_PATH)
  if (scope === undefined) throw new Error('.coverage-rules.yml is missing its scope block')
  return repoFiles().filter(file => {
    if (coverageDisposition(file, scope) === 'ignored') return false
    const rule = matchRule(file, rules)
    return rule !== null && rule.patch_coverage_min > 0
  })
}

describe('.coverage-rules.yml scope', () => {
  it('ignores generated, declaration, test, and fixture files that no suite ever instruments', () => {
    const files = repoFiles()
    const { scope } = loadCoverageConfig(RULES_PATH)
    if (scope === undefined) throw new Error('.coverage-rules.yml is missing its scope block')
    const exampleMatching = (pattern: RegExp): string => {
      const match = files.find(file => pattern.test(file))
      if (match === undefined) throw new Error(`no repo file matches ${String(pattern)} to sample`)
      return match
    }
    const declarationFile = exampleMatching(/\.d\.m?ts$/)
    const testFile = exampleMatching(/backend\/.*\.test\.mts$/)
    const testHelperFile = exampleMatching(/\/test-helpers\//)
    const fixtureFile = exampleMatching(/\/fixtures\//)
    for (const file of [declarationFile, testFile, testHelperFile, fixtureFile]) {
      expect(coverageDisposition(file, scope)).toBe('ignored')
    }
  })

  it('reports an untested file under the real ts-shared 100%-threshold rule as missing coverage', () => {
    // Guards the regression coverage:changed exists to prevent: an untested file inside a
    // 100%-threshold area (ts-shared/**) must surface as "no coverage data", never pass silently
    // because it has zero changed-line hits. Loads the real .coverage-rules.yml rules/scope (not
    // fabricated ones) so this fails if that file's ts-shared rule or scope block ever drifts.
    // The path and source below are fabricated-but-plausible fixtures, not a real repo file, so
    // this test stays hermetic and doesn't depend on real file content.
    const { rules, scope } = loadCoverageConfig(RULES_PATH)
    if (scope === undefined) throw new Error('.coverage-rules.yml is missing its scope block')
    const file = 'ts-shared/coverage-changed-negative-case.mts'
    const lcov: LcovData = new Map()
    const diff: DiffLines = new Map([[file, new Set([1])]])
    const readSource = () => 'export const coverageChangedNegativeCase = 1\n'

    const missing = findMissingCoverage(diff, lcov, rules, scope, readSource)

    expect(missing).toEqual([{ file, lines: [1], rule: 'ts-shared/**' }])
  })

  // Scans every reachable file in the repo, so it scales with repo size rather than the 30s
  // tooling-project default. A project-wide budget bump is the wrong mechanism here — see the
  // comment on toolingTestBudget in test-helpers/vitest-config/tooling-projects.mts.
  it('never marks a file ignored that the default Vitest coverage config would still instrument', () => {
    // Every positive-threshold rule below is backed by a suite running under
    // coverageConfigForScope(undefined) (see the file-level comment in .coverage-rules.yml). If
    // scope.ignored drifts looser than that config's `exclude`, a file with real LCOV coverage
    // would be wrongly treated as never-instrumented and coverage-check would stop verifying it.
    const files = reachableFiles()
    const defaultConfig = coverageConfigForScope(undefined)
    const defaultScope = {
      version: 1 as const,
      analyzer: 'javascript' as const,
      include: defaultConfig.include as string[],
      ignored: defaultConfig.exclude as string[],
    }

    const wronglyIgnored = files.filter(
      file => coverageDisposition(file, defaultScope) === 'ignored',
    )

    expect(wronglyIgnored).toEqual([])
  }, 120_000)
})
