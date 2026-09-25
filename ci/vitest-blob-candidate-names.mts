#!/usr/bin/env node
// Derives the exact Vitest blob fallback artifact candidate names for a resolved
// vitest-report-expectations:v2 context (issue #365).
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

function parseSuiteExpectation(value: unknown): VitestReportExpectation {
  if (
    !isPlainObject(value) ||
    typeof value.suite !== 'string' ||
    typeof value.minimumAttempt !== 'number'
  ) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} suite entry: expected {suite: string, minimumAttempt: number}`,
    )
  }
  return { suite: value.suite, minimumAttempt: value.minimumAttempt }
}

/**
 * Narrows a resolved expectations context to what this module needs to derive names. The
 * `merge-vitest-report-expectations` jq step (`ci-tests-processing.yml`) and vouchington-tooling's
 * `parseContext` (`prepare-vitest-reports`) already strictly validate this same value — exact keys,
 * version, attempt bounds, suite name pattern, `minimumAttempt` bounds, sort order, and uniqueness —
 * immediately upstream and again downstream of this script. This only re-checks what would
 * otherwise make derivation itself throw or silently produce the wrong names.
 */
export function parseVitestReportExpectationsContext(
  value: unknown,
): VitestReportExpectationsContext {
  if (!isPlainObject(value)) {
    throw new Error(`Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} context: expected an object`)
  }
  if (value.version !== VITEST_REPORT_EXPECTATIONS_VERSION) {
    throw new Error(`Unsupported Vitest report expectations version: ${String(value.version)}`)
  }
  if (typeof value.attempt !== 'number') {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} context: attempt must be a number`,
    )
  }
  if (!Array.isArray(value.suites)) {
    throw new Error(
      `Malformed ${VITEST_REPORT_EXPECTATIONS_VERSION} context: suites must be an array`,
    )
  }
  return {
    version: VITEST_REPORT_EXPECTATIONS_VERSION,
    attempt: value.attempt,
    suites: value.suites.map(entry => parseSuiteExpectation(entry)),
  }
}

/**
 * Every exact Vitest blob artifact name a suite may have produced, from its `minimumAttempt`
 * through the context's own current attempt inclusive, with and without the retry-step `-retry`
 * suffix (`.github/actions/upload-vitest-blob/action.yml`'s only observed `name-suffix` value).
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

export function runVitestBlobCandidateNamesCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  if (args.length > 0) {
    throw new Error('Usage: vitest-blob-candidate-names.mts (reads VITEST_REPORT_EXPECTATIONS)')
  }
  const raw = requireEnv(env, 'VITEST_REPORT_EXPECTATIONS')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('VITEST_REPORT_EXPECTATIONS is not valid JSON')
  }
  return deriveVitestBlobCandidateNames(parseVitestReportExpectationsContext(parsed))
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
