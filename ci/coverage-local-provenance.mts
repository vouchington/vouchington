import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  COVERAGE_MANIFEST_FILENAME,
  stampCoverageManifest,
  validateCoverageManifest,
} from 'coverage-check'
import { hasWebInit, runSuiteCoverage, suiteCoverageCommand } from './coverage-suites-local.mts'
import {
  localCoverageSuite,
  localCoverageSuiteDescriptor,
} from './coverage-local-suite-catalog.mts'
import { normalizeForwardedVitestArgs } from './run-vitest-project-group.mts'
import { coverageRepository } from './coverage-repository.mts'

const require = createRequire(import.meta.url)
export const LOCAL_VITEST_COLLECTOR_VERSION = (
  require('@vitest/coverage-v8/package.json') as { version: string }
).version

function revisionIdentity(root: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

export function stampLocalCoverageSuite(
  suiteName: string,
  artifactsDir: string,
  root = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): void {
  const suite = localCoverageSuite(suiteName)
  const pairDir = resolve(root, artifactsDir, suite.name)
  stampCoverageManifest({
    root,
    lcovPath: join(pairDir, 'lcov.info'),
    manifestPath: join(pairDir, COVERAGE_MANIFEST_FILENAME),
    descriptor: localCoverageSuiteDescriptor(suite),
    repository: coverageRepository(env),
    revision: revisionIdentity(root),
    run: null,
    collectorVersion: LOCAL_VITEST_COLLECTOR_VERSION,
  })
}

function coveragePairDirectories(root: string): string[] {
  const pairs = new Set<string>()
  const unsigned: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path)
      } else if (entry.name === 'lcov.info') {
        pairs.add(directory)
      } else if (entry.name === COVERAGE_MANIFEST_FILENAME) {
        pairs.add(directory)
      }
    }
  }
  visit(root)
  for (const pair of pairs) {
    const names = new Set(readdirSync(pair))
    if (!names.has('lcov.info') || !names.has(COVERAGE_MANIFEST_FILENAME)) unsigned.push(pair)
  }
  if (unsigned.length > 0) {
    throw new Error(`Unsigned coverage artifact(s): ${unsigned.join(', ')}`)
  }
  if (pairs.size === 0) throw new Error(`No signed coverage artifacts found under ${root}`)
  return [...pairs].toSorted()
}

export function validateLocalCoverageArtifacts(
  artifactsDir: string,
  root = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const absoluteArtifacts = resolve(root, artifactsDir)
  const revision = revisionIdentity(root)
  const validated: string[] = []
  for (const pairDir of coveragePairDirectories(absoluteArtifacts)) {
    const manifest = JSON.parse(
      readFileSync(join(pairDir, COVERAGE_MANIFEST_FILENAME), 'utf8'),
    ) as {
      suite?: unknown
    }
    if (typeof manifest.suite !== 'string') throw new Error('Coverage manifest suite is missing')
    const suite = localCoverageSuite(manifest.suite)
    validateCoverageManifest({
      root,
      lcovPath: join(pairDir, 'lcov.info'),
      manifestPath: join(pairDir, COVERAGE_MANIFEST_FILENAME),
      descriptor: localCoverageSuiteDescriptor(suite),
      repository: coverageRepository(env),
      revision,
      expectedRun: null,
      expectedCollectorVersion: LOCAL_VITEST_COLLECTOR_VERSION,
    })
    validated.push(pairDir)
  }
  return validated
}

export function runAndStampLocalCoverageSuite(
  suiteName: string,
  artifactsDir: string,
  root = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): number {
  const suite = localCoverageSuite(suiteName)
  const status = runSuiteCoverage(suite, artifactsDir, env)
  if (status === 0) stampLocalCoverageSuite(suiteName, artifactsDir, root, env)
  return status
}

export function explicitSuiteCommand(
  suiteName: string,
  artifactsDir = 'coverage',
): { command: string; outputDirectory: string } {
  const suite = localCoverageSuite(suiteName)
  return {
    command: suiteCoverageCommand(suite, artifactsDir).command,
    outputDirectory: join(artifactsDir, suite.name),
  }
}

export function runLocalCoverageSuiteCli(argv: readonly string[]): number {
  const [suiteName, ...rest] = normalizeForwardedVitestArgs(argv)
  const validOutput =
    rest.length === 0 || (rest.length === 2 && rest[0] === '--output' && Boolean(rest[1]?.trim()))
  if (!suiteName || !validOutput) {
    throw new Error('Usage: pnpm run coverage:suite -- <suite> [--output <artifacts-dir>]')
  }
  const artifactsDir = rest[1] ?? 'coverage'
  const suite = localCoverageSuite(suiteName)
  if (suite.requiresWebInit && !hasWebInit()) {
    throw new Error(`Suite "${suiteName}" requires ./dev/initialize web`)
  }
  rmSync(resolve(artifactsDir, suite.name), { recursive: true, force: true })
  return runAndStampLocalCoverageSuite(suiteName, artifactsDir)
}

if (import.meta.main) {
  try {
    process.exitCode = runLocalCoverageSuiteCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
