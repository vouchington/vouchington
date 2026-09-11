// Provenance stamping/validation for coverage:changed's ad-hoc 'changed' pseudo-suite.
//
// Bypasses the LOCAL_COVERAGE_SUITES catalog (coverage-local-suite-catalog.mts) on purpose: its
// Suite shape (projects as --project names, sourcePatterns for directory-based suite selection)
// doesn't fit an ad-hoc literal-file run, and adding a 'changed' catalog entry would make
// `pnpm run coverage:suite -- changed` a silently-broken CLI invocation (it would build a
// `--project changed` vitest arg that matches no real project). stampCoverageManifest/
// validateCoverageManifest's identity check only compares the descriptor built here at stamp
// time against the one built here again at validate time — it never checks against what vitest
// actually executed — so this is safe as long as both calls derive the descriptor identically.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import {
  COVERAGE_MANIFEST_FILENAME,
  stampCoverageManifest,
  validateCoverageManifest,
  type CoverageSuiteDescriptor,
} from 'coverage-check'

import { coverageConfigForScope } from '../test-helpers/vitest-config/coverage-config.mts'

export const CHANGED_SUITE_NAME = 'changed'

const require = createRequire(import.meta.url)
const VITEST_COLLECTOR_VERSION = (
  require('@vitest/coverage-v8/package.json') as { version: string }
).version

function changedCoverageDescriptor(testFiles: readonly string[]): CoverageSuiteDescriptor {
  const config = coverageConfigForScope(CHANGED_SUITE_NAME)
  return {
    suite: CHANGED_SUITE_NAME,
    projects: [...testFiles],
    collector: {
      name: 'vitest-v8',
      settings: {
        all: true,
        exclude: config.exclude,
        include: config.include,
        provider: 'v8',
        reporters: config.reporter,
        scope: CHANGED_SUITE_NAME,
      },
    },
  }
}

function repositoryIdentity(env: NodeJS.ProcessEnv): string {
  return env.GITHUB_REPOSITORY || 'jonathanong/filaments'
}

function revisionIdentity(root: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

export function stampChangedCoverage(
  testFiles: readonly string[],
  artifactsDir: string,
  root: string,
): void {
  const pairDir = resolve(root, artifactsDir, CHANGED_SUITE_NAME)
  stampCoverageManifest({
    root,
    lcovPath: join(pairDir, 'lcov.info'),
    manifestPath: join(pairDir, COVERAGE_MANIFEST_FILENAME),
    descriptor: changedCoverageDescriptor(testFiles),
    repository: repositoryIdentity(process.env),
    revision: revisionIdentity(root),
    run: null,
    collectorVersion: VITEST_COLLECTOR_VERSION,
  })
}

export function validateChangedCoverage(
  testFiles: readonly string[],
  artifactsDir: string,
  root: string,
): void {
  const pairDir = resolve(root, artifactsDir, CHANGED_SUITE_NAME)
  validateCoverageManifest({
    root,
    lcovPath: join(pairDir, 'lcov.info'),
    manifestPath: join(pairDir, COVERAGE_MANIFEST_FILENAME),
    descriptor: changedCoverageDescriptor(testFiles),
    repository: repositoryIdentity(process.env),
    revision: revisionIdentity(root),
    expectedRun: null,
    expectedCollectorVersion: VITEST_COLLECTOR_VERSION,
  })
}
