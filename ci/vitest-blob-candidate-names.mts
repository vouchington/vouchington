#!/usr/bin/env node
// Derives the exact Vitest blob fallback artifact candidate names for a resolved
// vitest-report-expectations:v2 context (issue #365). Mirrors the schema and attempt-identity
// invariants vouchington-tooling's internal reports-cli.mts `parseContext` enforces on the same
// context value downstream, since that unexported helper is not part of the package's public API.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { VITEST_SUITE_PATTERN } from 'vouchington-tooling/vitest-blob-manifest'
import type { VitestReportExpectation } from 'vouchington-tooling/vitest-reports'

export const VITEST_REPORT_EXPECTATIONS_VERSION = 'vitest-report-expectations:v2'
/** The only `name-suffix` value `.github/actions/upload-vitest-blob/action.yml` callers use. */
export const RETRY_NAME_SUFFIX = '-retry'

export interface VitestReportExpectationsContext {
  readonly version: typeof VITEST_REPORT_EXPECTATIONS_VERSION
  readonly attempt: number
  readonly suites: readonly VitestReportExpectation[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).toSorted().join('\0') === keys.toSorted().join('\0')
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

function parseSuiteExpectation(value: unknown, attempt: number): VitestReportExpectation {
  if (!isPlainObject(value) || !hasExactKeys(value, ['suite', 'minimumAttempt'])) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} suite entry: expected exactly {suite, minimumAttempt}`,
    )
  }
  const { suite, minimumAttempt } = value
  if (typeof suite !== 'string' || !VITEST_SUITE_PATTERN.test(suite)) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} suite entry: invalid suite name`,
    )
  }
  if (!isIntegerInRange(minimumAttempt, 1, attempt)) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} suite entry: invalid minimumAttempt for suite '${suite}'`,
    )
  }
  return { suite, minimumAttempt }
}

/** Validates a resolved expectations context against `currentAttempt` (the job's own attempt). */
export function parseVitestReportExpectationsContext(
  value: unknown,
  currentAttempt: number,
): VitestReportExpectationsContext {
  if (!isPlainObject(value) || !hasExactKeys(value, ['version', 'attempt', 'suites'])) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} context: expected exactly {version, attempt, suites}`,
    )
  }
  if (value.version !== VITEST_REPORT_EXPECTATIONS_VERSION) {
    throw new Error(`Unsupported Vitest report expectations version: ${String(value.version)}`)
  }
  if (value.attempt !== currentAttempt) {
    throw new Error(
      `Vitest report expectations attempt (${String(value.attempt)}) does not match GITHUB_RUN_ATTEMPT (${currentAttempt})`,
    )
  }
  if (!Array.isArray(value.suites)) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} context: suites must be an array`,
    )
  }
  const suites = value.suites.map(entry => parseSuiteExpectation(entry, currentAttempt))
  const suiteNames = suites.map(entry => entry.suite)
  if (new Set(suiteNames).size !== suiteNames.length) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} context: duplicate suite names`,
    )
  }
  if (suiteNames.join('\0') !== suiteNames.toSorted().join('\0')) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} context: suites must be sorted`,
    )
  }
  return { version: VITEST_REPORT_EXPECTATIONS_VERSION, attempt: currentAttempt, suites }
}

/**
 * Every exact Vitest blob artifact name a suite may have produced, from its `minimumAttempt`
 * through the current attempt inclusive, with and without the retry-step `-retry` suffix
 * (`.github/actions/upload-vitest-blob/action.yml`'s only observed `name-suffix` value).
 */
export function deriveVitestBlobCandidateNames(
  context: VitestReportExpectationsContext,
): readonly string[] {
  const names: string[] = []
  for (const { suite, minimumAttempt } of context.suites) {
    for (let attempt = minimumAttempt; attempt <= context.attempt; attempt += 1) {
      const base = `vitest-blob-${suite}-attempt-${attempt}`
      names.push(base, `${base}${RETRY_NAME_SUFFIX}`)
    }
  }
  return names
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

/** Local equivalent of vouchington-tooling's unexported `parseGitHubRunAttempt`. */
function parseCurrentAttempt(env: NodeJS.ProcessEnv): number {
  const raw = requireEnv(env, 'GITHUB_RUN_ATTEMPT')
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error('GITHUB_RUN_ATTEMPT must be a positive integer')
  }
  return Number(raw)
}

export function runVitestBlobCandidateNamesCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  if (args.length > 0) {
    throw new Error('Usage: vitest-blob-candidate-names.mts (reads VITEST_REPORT_EXPECTATIONS)')
  }
  const currentAttempt = parseCurrentAttempt(env)
  const raw = requireEnv(env, 'VITEST_REPORT_EXPECTATIONS')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('VITEST_REPORT_EXPECTATIONS is not valid JSON')
  }
  return deriveVitestBlobCandidateNames(
    parseVitestReportExpectationsContext(parsed, currentAttempt),
  )
}

const invokedPath = process.argv[1]
if (invokedPath && realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    for (const name of runVitestBlobCandidateNamesCli(process.argv.slice(2))) {
      process.stdout.write(`${name}\n`)
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
