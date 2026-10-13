import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  coverageDisposition,
  findMissingCoverage,
  loadCoverageConfig,
  type DiffLines,
  type LcovData,
} from 'coverage-check'
import { describe, expect, it, onTestFinished } from 'vitest'

import { coverageConfigForScope } from '../test-helpers/vitest-config/coverage-config.mts'
import { findCoverageScopeMismatches } from './coverage-scope.mts'
import { checkCoverageScope } from './check-coverage-scope.mts'

const RULES_PATH = '.coverage-rules.yml'

describe('.coverage-rules.yml scope', () => {
  it('ignores generated, declaration, test, and fixture files that no suite ever instruments', () => {
    const { scope } = loadCoverageConfig(RULES_PATH)
    if (scope === undefined) throw new Error('.coverage-rules.yml is missing its scope block')
    const declarationFile = 'backend/example.d.mts'
    const testFile = 'backend/example.test.mts'
    const testHelperFile = 'backend/test-helpers/example.mts'
    const fixtureFile = 'backend/fixtures/example.mts'
    for (const file of [declarationFile, testFile, testHelperFile, fixtureFile]) {
      expect(coverageDisposition(file, scope)).toBe('ignored')
    }
  })

  it('reports an untested file under the real ts-shared 100%-threshold rule as missing coverage', () => {
    // Guards the regression the area coverage gate prevents: an untested file inside a
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

  it('never marks a file ignored that the default Vitest coverage config would still instrument', () => {
    const config = coverageConfigForScope(undefined)
    const instrumentedScope = {
      version: 1 as const,
      analyzer: 'javascript' as const,
      include: config.include as string[],
      ignored: config.exclude as string[],
    }
    const paths = [
      'backend/services/example.mts',
      'ts-shared/example.mts',
      'web/components/example.tsx',
    ]
    expect(
      findCoverageScopeMismatches(paths, loadCoverageConfig(RULES_PATH), instrumentedScope),
    ).toEqual([])
  })

  it('detects a positive-threshold path excluded by the collector', () => {
    const file = 'backend/services/example.mts'
    const instrumentedScope = {
      version: 1 as const,
      analyzer: 'javascript' as const,
      include: ['**/*.{mts,ts,tsx}'],
      ignored: [file],
    }
    expect(
      findCoverageScopeMismatches([file], loadCoverageConfig(RULES_PATH), instrumentedScope),
    ).toEqual([file])
  })

  it('does not charge ignored, zero-threshold or unmatched paths to a collector', () => {
    const instrumentedScope = {
      version: 1 as const,
      analyzer: 'javascript' as const,
      include: ['**/*.{mts,ts,tsx}'],
      ignored: ['**/*'],
    }
    const paths = ['backend/example.test.mts', 'backend/scripts/example.mts', 'ci/example.mts']
    expect(
      findCoverageScopeMismatches(paths, loadCoverageConfig(RULES_PATH), instrumentedScope),
    ).toEqual([])
  })

  it('rejects configuration without a scope before processing paths', () => {
    const config = loadCoverageConfig(RULES_PATH)
    const instrumentedScope = {
      version: 1 as const,
      analyzer: 'javascript' as const,
      include: ['**/*.mts'],
      ignored: [],
    }
    expect(() =>
      findCoverageScopeMismatches([], { ...config, scope: undefined }, instrumentedScope),
    ).toThrow('.coverage-rules.yml is missing its scope block')
  })
})

async function createScopeFixture(file: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'coverage-scope-fixture-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(dirname(join(cwd, file)), { recursive: true })
  await writeFile(join(cwd, file), 'export const fixture = true\n')
  await writeFile(
    join(cwd, '.coverage-rules.yml'),
    [
      'scope:',
      '  version: 1',
      '  analyzer: javascript',
      '  include: ["**/*.mts"]',
      '  ignored: []',
      'rules:',
      '  - paths: "backend/**"',
      '    patch_coverage_min: 1',
      '',
    ].join('\n'),
  )
  execFileSync('git', ['init', '--quiet', '--initial-branch=test-coverage-scope'], { cwd })
  execFileSync('git', ['add', '--', file, '.coverage-rules.yml'], { cwd })
  return cwd
}

describe('coverage scope command', () => {
  it('accepts tracked paths included by the collector', async () => {
    const cwd = await createScopeFixture('backend/services/owned.mts')
    expect(() => checkCoverageScope(cwd)).not.toThrow()
  })

  it('fails when a positive rule requires a tracked collector exclusion', async () => {
    const cwd = await createScopeFixture('backend/dev.mts')
    expect(() => checkCoverageScope(cwd)).toThrow('backend/dev.mts')
  })
})
