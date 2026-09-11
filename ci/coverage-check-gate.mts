#!/usr/bin/env node
// Shared helper: merge LCOV artifacts and run the coverage-check gate.
// Used by coverage:patch (ci/local-patch-coverage.mts) and
// coverage:patch:full (ci/coverage-local-full.mts).
//
import {
  type CheckArgs,
  type EvaluatedCheck,
  evaluateCheck,
  runCheck,
  zeroThresholdGlobs as packageZeroThresholdGlobs,
} from 'coverage-check'

export interface CoverageGateOptions {
  artifactsDir: string
  base: string
  head: string
  jsonPath?: string
  /**
   * Path globs to exempt from the local coverage gate. This is passed to
   * coverage-check ignorePaths, which prepends patch_coverage_min:0 override
   * rules for this run. Rule matching inside coverage-check uses node:path
   * matchesGlob.
   */
  excludePathGlobs?: string[]
  /** Exit 0 even on coverage shortfall — compute and print, but never block. Default: false. */
  advisory?: boolean
}

/** Globs from .coverage-rules.yml whose patch_coverage_min is 0 (no local coverage required). */
export function zeroThresholdGlobs(rulesPath = '.coverage-rules.yml'): string[] {
  try {
    return packageZeroThresholdGlobs(rulesPath)
  } catch {
    return []
  }
}

const LOCAL_GATE_DEFAULTS = {
  pr: null,
  stripPrefixes: [],
  store: null,
  suite: null,
  annotateSource: true,
  aggregateArtifacts: true,
  failOnEmpty: true,
} satisfies Pick<
  CheckArgs,
  | 'pr'
  | 'stripPrefixes'
  | 'store'
  | 'suite'
  | 'annotateSource'
  | 'aggregateArtifacts'
  | 'failOnEmpty'
>

export async function runMergeAndCheck(opts: CoverageGateOptions): Promise<number> {
  return runCheck({
    ...LOCAL_GATE_DEFAULTS,
    rules: '.coverage-rules.yml',
    artifacts: opts.artifactsDir,
    base: opts.base,
    head: opts.head,
    repo: process.env.GITHUB_REPOSITORY ?? '',
    json: opts.jsonPath ?? null,
    ignorePaths: opts.excludePathGlobs ?? [],
    advisory: opts.advisory ?? false,
  })
}

/**
 * Same inputs as runMergeAndCheck, but returns the raw evaluation instead of printing
 * coverage-check's own pass/fail banner. `advisory` only changes runMergeAndCheck's exit code,
 * not its console output — callers that need a custom report format (e.g. coverage:changed,
 * which always prints a quiet three-section advisory preview) should call this instead.
 */
export async function evaluateMergeAndCheck(opts: CoverageGateOptions): Promise<EvaluatedCheck> {
  return evaluateCheck({
    ...LOCAL_GATE_DEFAULTS,
    rules: '.coverage-rules.yml',
    artifacts: opts.artifactsDir,
    base: opts.base,
    head: opts.head,
    repo: process.env.GITHUB_REPOSITORY ?? '',
    json: opts.jsonPath ?? null,
    ignorePaths: opts.excludePathGlobs ?? [],
    advisory: opts.advisory ?? false,
  })
}
