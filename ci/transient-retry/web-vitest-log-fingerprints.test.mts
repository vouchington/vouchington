import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'

import { RULES, type WorkflowRunContext } from './rules.mts'
import { hasWebVitestSegfault } from './web-vitest-log-fingerprints.mts'

// pnpm quotes arguments that contain '='. The credentialed SIGKILL fixture records that shape.
function quotePnpmEqualsArgs(command: string): string {
  return command.replace(/(^|\s)(--[^\s=]+=[^\s]+)/g, "$1'$2'")
}

function webTestsKilledCommand(): string {
  const workflow = parseYaml(readFileSync('.github/workflows/tests-web.yml', 'utf8')) as {
    jobs: { 'web-tests': { steps?: Array<{ name?: string; run?: string }> } }
  }
  const run = workflow.jobs['web-tests'].steps?.find(step => step.name === 'Run web tests')?.run
  if (run === undefined) throw new Error('tests-web.yml is missing Run web tests')
  const concrete = run
    .replaceAll('${{ matrix.shard }}', '1')
    .replaceAll('${{ needs.prep.outputs.shard-total }}', '3')
  const prefix = 'pnpm exec '
  if (!concrete.startsWith(prefix)) throw new Error(`unexpected web test command: ${concrete}`)
  return quotePnpmEqualsArgs(concrete.slice(prefix.length))
}

function sigsegvLog(killedCommand: string): string {
  return [
    'VITEST_COVERAGE_ENABLED: true',
    `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command was killed with SIGSEGV (Segmentation fault): ${killedCommand}`,
    '##[error]Process completed with exit code 1.',
  ].join('\n')
}

const webTestsJobName = 'test-web / web-tests (1)'
const matchingLog = [
  'RUN vX.Y.Z /Users/dev/actions-runners/1/_work/filaments/filaments',
  'VITEST_COVERAGE_ENABLED: true',
  'undefined',
  "ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command was killed with SIGSEGV (Segmentation fault): vitest run '--bail=3' --project web --shard 1/3 --passWithNoTests",
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Web',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('web-vitest-sigsegv', () => {
  it('matches the historical direct vitest invocation that still included --passWithNoTests', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'web'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('web-vitest-sigsegv')
  })

  it('matches the live tests-web.yml command when Vitest is killed with SIGSEGV', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'web'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[webTestsJobName, sigsegvLog(webTestsKilledCommand())]])),
    })

    const result = await decide(ctx, RULES)
    expect(webTestsKilledCommand()).toContain('./ci/with-node-test-options vitest run')
    expect(webTestsKilledCommand()).not.toContain('--passWithNoTests')
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('web-vitest-sigsegv')
  })

  it('matches the same SIGSEGV fingerprint when coverage is not publishing', () => {
    expect(
      hasWebVitestSegfault(
        matchingLog.replace('VITEST_COVERAGE_ENABLED: true', 'VITEST_COVERAGE_ENABLED: false'),
      ),
    ).toBe(true)
  })

  it.each(['web-api', 'web-integration', 'web-storybook'])(
    'does not treat a %s SIGSEGV as the web shard command',
    project => {
      const command = quotePnpmEqualsArgs(
        `./ci/with-node-test-options vitest run --bail=3 --project ${project} --shard 1/3`,
      )
      expect(hasWebVitestSegfault(sigsegvLog(command))).toBe(false)
    },
  )

  it('fails closed for the removed unsharded coverage command', () => {
    expect(
      hasWebVitestSegfault(matchingLog.replace('--shard 1/3 --passWithNoTests', '--coverage')),
    ).toBe(false)
  })

  it('does not match a web assertion failure', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'web'],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([[webTestsJobName, 'AssertionError: expected button to be visible']]),
        ),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when the web test job is not the failed leaf job', async () => {
    const ctx = makeCtx({
      failedJobNames: ['web'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another non-aggregate job also fails', async () => {
    const ctx = makeCtx({
      failedJobNames: [webTestsJobName, 'test-backend-unit / backend-tests (1)', 'web'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 2,
      failedJobNames: [webTestsJobName, 'web'],
      failedJobLogs: () => Promise.resolve(new Map([[webTestsJobName, matchingLog]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
