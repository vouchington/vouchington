#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COVERAGE_MANIFEST_FILENAME,
  SOURCE_ROOT_ALGORITHM,
  createPatchCoverageContribution,
  serializeCoverageManifest,
  stampCoverageManifest,
  validateCoverageManifest,
  type CoverageManifest,
  type PatchCoverageManifest,
  type StampCoverageManifestOptions,
  type ValidateCoverageManifestOptions,
} from 'coverage-check'
import { coverageProducerPartition, coverageSuiteDescriptor } from './coverage-suites.mts'
import { coverageRepository } from './coverage-repository.mts'

export type AnyCoverageManifest = CoverageManifest | PatchCoverageManifest

export {
  COVERAGE_MANIFEST_FILENAME,
  SOURCE_ROOT_ALGORITHM,
  serializeCoverageManifest,
  stampCoverageManifest,
  validateCoverageManifest,
  type CoverageManifest,
  type PatchCoverageManifest,
  type StampCoverageManifestOptions,
  type ValidateCoverageManifestOptions,
}

interface CoverageManifestCliRuntime {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly revision?: string
}

export async function runCoverageManifestCli(
  args: readonly string[],
  runtime: CoverageManifestCliRuntime = {},
): Promise<AnyCoverageManifest> {
  const [command, suite, collectorVersion, rawLcovPath, rawManifestPath, ...extra] = args
  if (
    (command !== 'stamp' && command !== 'patch') ||
    !suite ||
    !collectorVersion ||
    extra.length > 0
  ) {
    throw new Error(
      'Usage: coverage-manifest.mts <stamp|patch> <suite> <collector-version> [lcov-path] [manifest-path]',
    )
  }
  const cwd = runtime.cwd ?? process.cwd()
  const env = runtime.env ?? process.env
  const revision =
    runtime.revision ??
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  const runId = env.GITHUB_RUN_ID
  const rawRunAttempt = env.GITHUB_RUN_ATTEMPT
  if ((runId && !rawRunAttempt) || (!runId && rawRunAttempt)) {
    throw new Error('GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be provided together')
  }
  const common = {
    root: cwd,
    lcovPath: resolve(cwd, rawLcovPath ?? 'coverage/lcov.info'),
    manifestPath: resolve(cwd, rawManifestPath ?? `coverage/${COVERAGE_MANIFEST_FILENAME}`),
    descriptor: coverageSuiteDescriptor(suite),
    repository: coverageRepository(env),
    revision,
    collectorVersion,
  }
  if (!existsSync(common.lcovPath)) {
    throw new Error(`Missing coverage producer LCOV for suite '${suite}' at ${common.lcovPath}`)
  }
  const run = runId && rawRunAttempt ? { id: runId, attempt: Number(rawRunAttempt) } : null
  if (command === 'stamp') return stampCoverageManifest({ ...common, run })
  const base = env.PR_BASE_SHA
  const head = env.PR_HEAD_SHA
  if (!run || !base || !head) {
    throw new Error('Patch coverage requires CI run identity plus PR_BASE_SHA and PR_HEAD_SHA')
  }
  return createPatchCoverageContribution({
    ...common,
    run,
    base,
    head,
    producer: coverageProducerPartition(suite, env),
  })
}

const invokedPath = process.argv[1]
if (invokedPath && realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    await runCoverageManifestCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
