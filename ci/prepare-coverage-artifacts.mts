#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

import { expectedCollectorVersion, preparePatchCoverageArtifacts } from 'coverage-check'

import { coverageSuiteDescriptor } from './coverage-suites.mts'
import { shardedCoverageJobs } from './coverage-suite-descriptors.mts'

export interface PrepareCoverageArtifactsOptions {
  readonly root: string
  readonly sourceDir: string
  readonly artifactsDir: string
  readonly repository: string
  readonly revision: string
  readonly expectedRun: { readonly id: string; readonly currentAttempt: number }
  readonly base: string
  readonly head: string
  readonly expectedProducerGroups?: readonly string[]
}

const coverageProducerGroupsByJob: Readonly<Record<string, readonly string[]>> = {
  'test-ts-shared': ['ts-shared'],
  'test-tooling': ['tooling'],
  'test-backend-modules': ['backend-modules'],
  'test-backend-credentialed': ['backend-credentialed'],
  storybook: ['web-storybook', 'web-storybook-browser'],
  'test-cloudflare-worker': ['cloudflare-worker'],
  'test-lambdas': ['lambdas'],
  'test-portability': ['portability-linux', 'portability-macos'],
  ...Object.fromEntries(
    shardedCoverageJobs.map(({ job, producerGroup }) => [job.orchestratorJob, [producerGroup]]),
  ),
}

export function expectedCoverageProducerGroups(
  rawResults: string | undefined,
  storybookBrowserMode: string,
): readonly string[] {
  if (!rawResults) throw new Error('RESULTS is required')
  const results = JSON.parse(rawResults) as unknown
  if (!results || typeof results !== 'object' || Array.isArray(results)) {
    throw new Error('RESULTS must be a JSON object')
  }
  const expected = new Set<string>()
  for (const [job, value] of Object.entries(results)) {
    if (
      job === 'detect-changes' ||
      value === null ||
      typeof value !== 'object' ||
      !('result' in value) ||
      value.result !== 'success'
    ) {
      continue
    }
    const groups = coverageProducerGroupsByJob[job]
    if (!groups) throw new Error(`Successful coverage producer has no group contract: ${job}`)
    for (const group of groups) {
      if (group !== 'web-storybook-browser' || storybookBrowserMode !== 'empty') {
        expected.add(group)
      }
    }
  }
  return [...expected].toSorted((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function resolveSuite(root: string, suite: string) {
  try {
    const descriptor = coverageSuiteDescriptor(suite)
    return {
      descriptor,
      expectedCollectorVersion: expectedCollectorVersion(root, descriptor),
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unknown coverage suite:')) {
      return undefined
    }
    throw error
  }
}

export async function prepareCoverageArtifacts(options: PrepareCoverageArtifactsOptions): Promise<{
  readonly selected: readonly { readonly suite: string }[]
}> {
  const result = await preparePatchCoverageArtifacts({
    root: options.root,
    sources: [{ name: 'coverage', directory: options.sourceDir }],
    outputDirectory: options.artifactsDir,
    repository: options.repository,
    revision: options.revision,
    run: options.expectedRun,
    base: options.base,
    head: options.head,
    expectedProducerGroups: options.expectedProducerGroups,
    resolveDescriptor: suite => resolveSuite(options.root, suite),
  })
  return {
    selected: result.selected
      .map(({ suite }) => ({ suite }))
      .toSorted((left, right) => Buffer.from(left.suite).compare(Buffer.from(right.suite))),
  }
}

async function main(): Promise<number> {
  try {
    const runId = process.env.GITHUB_RUN_ID
    const rawAttempt = process.env.GITHUB_RUN_ATTEMPT
    const base = process.env.PR_BASE_SHA
    const head = process.env.PR_HEAD_SHA
    if (!runId || !rawAttempt || !base || !head) {
      throw new Error(
        'GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, PR_BASE_SHA, and PR_HEAD_SHA are required',
      )
    }
    const result = await prepareCoverageArtifacts({
      root: process.cwd(),
      sourceDir: process.env.COVERAGE_FALLBACK_DIR ?? './coverage-fallback',
      artifactsDir: process.env.COVERAGE_ARTIFACTS_DIR ?? './coverage-artifacts',
      repository: process.env.GITHUB_REPOSITORY || 'jonathanong/filaments',
      revision:
        process.env.GITHUB_SHA ??
        execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      expectedRun: { id: runId, currentAttempt: Number(rawAttempt) },
      base,
      head,
      expectedProducerGroups: expectedCoverageProducerGroups(
        process.env.RESULTS,
        process.env.STORYBOOK_BROWSER_MODE ?? 'full',
      ),
    })
    for (const pair of result.selected) {
      console.log(`Selected coverage pair for ${pair.suite}.`)
    }
    console.log('Coverage artifacts are complete and provenance-validated.')
    return 0
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (import.meta.main) process.exit(await main())
