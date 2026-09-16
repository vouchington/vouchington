import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  type ExpectationOptions,
  type ProducerResults,
  type SuiteExpectation,
  writeAttemptFixtures,
  writeExplicitAttemptFixtures,
} from './vitest-report-expectation-fixture.mts'
import {
  expectationStep,
  mergeExpectationStep,
} from './vitest-report-expectation-workflows-fixture.mts'

type ResolverResult = { status: number | null; output: string; stderr: string; stdout: string }
type ResolvedContext = { attempt: number; suites: SuiteExpectation[]; version: string }

function shardSuites(prefix: string, total: number, minimumAttempt: number): SuiteExpectation[] {
  return Array.from({ length: total }, (_, index) => ({
    suite: `${prefix}-${index + 1}`,
    minimumAttempt,
  }))
}

function runExpectationResolver(
  results: ProducerResults,
  options: ExpectationOptions = {},
): ResolverResult {
  expect(expectationStep?.run).toBeTypeOf('string')
  const directory = mkdtempSync(join(tmpdir(), 'vitest-report-expectation-'))
  const outputPath = join(directory, 'github-output')
  const attemptsDirectory = join(directory, 'attempts')
  writeAttemptFixtures(attemptsDirectory, results)
  writeExplicitAttemptFixtures(attemptsDirectory, options.attempts ?? {})
  const result = spawnSync('bash', ['-e', '-c', expectationStep?.run ?? ''], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: 'jonathanong/filaments',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_RUN_ID: '9131',
      GITHUB_SHA: 'a'.repeat(40),
      VITEST_REPORT_ATTEMPTS_DIR: attemptsDirectory,
      RESULTS: JSON.stringify(
        Object.fromEntries(
          Object.entries(results).map(([job, value]) => [
            job,
            { ...value, attempt: value.attempt ?? '2' },
          ]),
        ),
      ),
      BACKEND_UNIT_SHARD_TOTAL: options.shardTotals?.['test-backend-unit'] ?? '',
      WEB_SHARD_TOTAL: options.shardTotals?.['test-web'] ?? '',
      WEB_API_SHARD_TOTAL: options.shardTotals?.['test-web-api'] ?? '',
      WEB_INTEGRATION_SHARD_TOTAL: options.shardTotals?.['test-web-integration'] ?? '',
      STORYBOOK_BROWSER_MODE: options.storybookBrowserMode ?? 'full',
      PORTABILITY_MACOS_ENABLED: String(options.portabilityMacosEnabled ?? false),
      RUN_WEB_TESTS: String(options.runnable?.['test-web'] ?? false),
      RUN_WEB_API_TESTS: String(options.runnable?.['test-web-api'] ?? false),
      RUN_BACKEND_UNIT_TESTS: String(options.runnable?.['test-backend-unit'] ?? false),
      RUN_BACKEND_MODULE_TESTS: String(options.runnable?.['test-backend-modules'] ?? false),
      RUN_CLOUDFLARE_WORKER_TESTS: String(options.runnable?.['test-cloudflare-worker'] ?? false),
      RUN_LAMBDA_TESTS: String(options.runnable?.['test-lambdas'] ?? false),
    },
  })
  const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8').trim() : ''
  rmSync(directory, { force: true, recursive: true })
  return { status: result.status, output, stderr: result.stderr, stdout: result.stdout }
}

function resolveContext(
  results: ProducerResults,
  options: ExpectationOptions = {},
): ResolvedContext {
  const result = runExpectationResolver(results, options)
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
  return JSON.parse(result.output.slice('context='.length)) as ResolvedContext
}

function runMergeExpectationResolver(
  base: unknown,
  postgres: { attempt?: string; result: string; vitestRan: boolean } = {
    result: 'skipped',
    vitestRan: false,
  },
): { output: string; status: number | null; stderr: string } {
  expect(mergeExpectationStep?.run).toBeTypeOf('string')
  const directory = mkdtempSync(join(tmpdir(), 'vitest-report-merge-expectation-'))
  const outputPath = join(directory, 'github-output')
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', mergeExpectationStep?.run ?? ''], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BASE_CONTEXT: JSON.stringify(base),
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_OUTPUT: outputPath,
      POSTGRES_RESULT: postgres.result,
      POSTGRES_VITEST_RAN: String(postgres.vitestRan),
      POSTGRES_VITEST_ATTEMPT: postgres.attempt ?? '2',
    },
  })
  const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8').trim() : ''
  rmSync(directory, { force: true, recursive: true })
  return { output, status: result.status, stderr: result.stderr }
}

describe('Vitest report expectation fan-in', () => {
  it('emits exact runnable suite expectations before producer failure handling', () => {
    const resolution = runExpectationResolver(
      { 'test-backend-unit': { result: 'failure' }, 'test-tooling': { result: 'success' } },
      { runnable: { 'test-backend-unit': true }, shardTotals: { 'test-backend-unit': '2' } },
    )
    expect(resolution.status).toBe(1)
    expect(JSON.parse(resolution.output.slice('context='.length))).toEqual({
      version: 'vitest-report-expectations:v2',
      attempt: 2,
      suites: [...shardSuites('backend-shard', 2, 2), { suite: 'tooling', minimumAttempt: 2 }],
    })
    expect(resolution.stdout).toContain(
      '::error::One or more Vitest producer jobs failed or were cancelled.',
    )
  })

  it('expands dynamic shards, Storybook mode, and PostgreSQL execution', () => {
    const base = resolveContext(
      {
        'test-backend-unit': { result: 'success' },
        'test-web': { result: 'success' },
        storybook: { result: 'success' },
      },
      {
        runnable: { 'test-backend-unit': true, 'test-web': true },
        shardTotals: {
          'test-backend-unit': '2',
          'test-web': '1',
        },
        storybookBrowserMode: 'empty',
      },
    )
    expect(base.suites.map(expectation => expectation.suite)).toEqual([
      'backend-shard-1',
      'backend-shard-2',
      'web-shard-1',
      'web-storybook',
    ])

    const result = runMergeExpectationResolver(base, { result: 'failure', vitestRan: true })
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
    const merged = JSON.parse(result.output.slice('context='.length)) as {
      suites: SuiteExpectation[]
    }
    expect(merged.suites).toContainEqual({ suite: 'postgres-schema', minimumAttempt: 2 })
  })

  it('uses exact producer totals for web API and integration', () => {
    const exact = resolveContext(
      {
        'test-backend-unit': { result: 'success' },
        'test-web': { result: 'success' },
        'test-web-api': { result: 'success' },
        'test-web-integration': { result: 'success' },
      },
      {
        runnable: {
          'test-backend-unit': true,
          'test-web': true,
          'test-web-api': true,
        },
        attempts: {
          'web-api-shard-3': 2,
          'web-integration-shard-2': 2,
        },
        shardTotals: {
          'test-backend-unit': '2',
          'test-web': '1',
          'test-web-api': '3',
          'test-web-integration': '2',
        },
      },
    )
    expect(exact.suites.map(({ suite }) => suite)).toEqual([
      'backend-shard-1',
      'backend-shard-2',
      'web-api-shard-1',
      'web-api-shard-2',
      'web-api-shard-3',
      'web-integration-shard-1',
      'web-integration-shard-2',
      'web-shard-1',
    ])

    const planned = resolveContext(
      {
        'test-web-api': { result: 'success' },
        'test-web-integration': { result: 'success' },
      },
      {
        runnable: { 'test-web-api': true },
        attempts: {
          'web-api-shard-3': 2,
          'web-integration-shard-2': 2,
        },
        shardTotals: {
          'test-web-api': '3',
          'test-web-integration': '2',
        },
      },
    )
    expect(planned.suites.map(({ suite }) => suite)).toEqual([
      'web-api-shard-1',
      'web-api-shard-2',
      'web-api-shard-3',
      'web-integration-shard-1',
      'web-integration-shard-2',
    ])
  })

  it('fails closed when a running sharded producer has no exact total', () => {
    const result = runExpectationResolver({ 'test-web-integration': { result: 'success' } })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('running sharded producer has no exact shard total')
  })

  it('does not expect blobs from successful side-duty-only jobs', () => {
    expect(
      resolveContext({
        'test-backend-modules': { result: 'success' },
        'test-cloudflare-worker': { result: 'success' },
        'test-lambdas': { result: 'success' },
      }).suites.map(expectation => expectation.suite),
    ).toEqual([])
  })

  it('expects blobs when an actual successful producer ran tests', () => {
    expect(
      resolveContext(
        { 'test-backend-modules': { result: 'success' } },
        { runnable: { 'test-backend-modules': true } },
      ).suites.map(expectation => expectation.suite),
    ).toEqual(['backend-modules'])
    expect(
      resolveContext(
        { 'test-web': { result: 'skipped' } },
        { runnable: { 'test-web': true } },
      ).suites.map(expectation => expectation.suite),
    ).toEqual([])
    const p: ProducerResults = { 'test-portability': { result: 'success' } }
    const withMacos = resolveContext(p, { portabilityMacosEnabled: true })
    expect(resolveContext(p).suites.map(e => e.suite)).toEqual(['portability-linux'])
    expect(withMacos.suites.map(e => e.suite)).toEqual(['portability-linux', 'portability-macos'])
  })
  it.each(['failure', 'cancelled'])(
    'keeps suite-specific floors after aggregate %s',
    aggregateResult => {
      const resolution = runExpectationResolver(
        { 'test-backend-unit': { result: aggregateResult } },
        {
          attempts: {
            'backend-shard-1': 2,
            'backend-shard-2': 1,
            'backend-shard-3': 1,
            'backend-shard-4': 1,
          },
          runnable: { 'test-backend-unit': true },
          shardTotals: { 'test-backend-unit': '4' },
        },
      )

      expect(resolution.status).toBe(1)
      const context = JSON.parse(resolution.output.slice('context='.length)) as {
        suites: SuiteExpectation[]
      }
      expect(context.suites.map(suite => suite.minimumAttempt)).toEqual([
        2,
        1,
        1,
        1,
        ...shardSuites('backend-shard', 4, 2)
          .slice(4)
          .map(() => 2),
      ])
    },
  )

  it.each(['failure', 'cancelled'])('fails aggregation for a %s producer', result => {
    const resolution = runExpectationResolver(
      { 'test-backend-unit': { result } },
      { runnable: { 'test-backend-unit': true }, shardTotals: { 'test-backend-unit': '1' } },
    )
    expect(resolution.status).toBe(1)
    expect(resolution.stdout).toContain(
      '::error::One or more Vitest producer jobs failed or were cancelled.',
    )
  })
})
