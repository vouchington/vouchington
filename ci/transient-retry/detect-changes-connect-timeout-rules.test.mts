import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const detectChangesJobName = 'changes / detect-changes'
const connectTimeoutAnnotation = 'Connect Timeout Error'
const ruleId = 'detect-changes-paths-filter-github-connect-timeout'

// Trimmed from Cloudflare Worker run 37302066554, job changes / detect-changes.
// The paths-filter token line is omitted. The action SHA is real log text, not a matcher pin.
const pathsFilterConnectTimeoutLog = [
  '2026-10-05T11:18:45.7039308Z ##[group]Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d',
  '2026-10-05T11:18:45.7039849Z with:',
  '2026-10-05T11:18:45.7040132Z   filters: .github/ci-path-filters.yml',
  '2026-10-05T11:18:45.7042958Z   list-files: none',
  '2026-10-05T11:18:45.7044285Z ##[endgroup]',
  '2026-10-05T11:18:45.9155689Z ##[group]Fetching list of changed files for PR#2025 from GitHub API',
  '2026-10-05T11:18:45.9331491Z Invoking listFiles(pull_number: 2025, per_page: 100)',
  '2026-10-05T11:18:55.9922167Z ##[endgroup]',
  '2026-10-05T11:18:55.9987623Z ##[error]Connect Timeout Error',
].join('\n')

const filterConfigError = '##[error]Error: Invalid filter configuration: unknown filter type'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Cloudflare Worker',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [detectChangesJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[detectChangesJobName, pathsFilterConnectTimeoutLog]])),
  failedJobAnnotations: () => Promise.resolve([connectTimeoutAnnotation]),
  ...overrides,
})

const logsFor = (log: string) => () => Promise.resolve(new Map([[detectChangesJobName, log]]))

describe('detect-changes-paths-filter-github-connect-timeout', () => {
  it.each([
    ['Web', 'web'],
    ['Backend', 'backend'],
    ['Cloudflare Worker', 'cloudflare-worker'],
    ['Lambdas', 'lambdas'],
    ['Tooling', 'tooling'],
  ])('matches %s when the area gate also fails', async (workflowName, gate) => {
    await expect(
      decide(
        makeCtx({
          workflowName,
          failedJobNames: [detectChangesJobName, gate],
        }),
        RULES,
      ),
    ).resolves.toMatchObject({ decision: 'rerun', matchedRule: ruleId })
  })

  it('matches after the paths-filter action SHA changes', async () => {
    const log = pathsFilterConnectTimeoutLog.replace(
      'ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
    await expect(decide(makeCtx({ failedJobLogs: logsFor(log) }), RULES)).resolves.toMatchObject({
      decision: 'rerun',
      matchedRule: ruleId,
    })
  })

  it('does not match the GitHub 5xx annotation rule', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.matchedRule).not.toBe('detect-changes-paths-filter-github-5xx')
  })

  it('leaves a branded GitHub 5xx annotation on the 5xx rule', async () => {
    const github5xxAnnotation = ['<!DOCTYPE html>', '<title>Unicorn! &middot; GitHub</title>'].join(
      '\n',
    )
    await expect(
      decide(
        makeCtx({
          failedJobAnnotations: () => Promise.resolve([github5xxAnnotation]),
          failedJobLogs: () => Promise.resolve(new Map()),
        }),
        RULES,
      ),
    ).resolves.toMatchObject({
      decision: 'rerun',
      matchedRule: 'detect-changes-paths-filter-github-5xx',
    })
  })

  it('does not match a filter configuration failure after listFiles', async () => {
    const log = pathsFilterConnectTimeoutLog.replace(
      '##[error]Connect Timeout Error',
      filterConfigError,
    )
    await expect(
      decide(
        makeCtx({
          failedJobLogs: logsFor(log),
          failedJobAnnotations: () =>
            Promise.resolve([filterConfigError.slice('##[error]'.length)]),
        }),
        RULES,
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('does not match a connect timeout before listFiles starts', async () => {
    const log = [
      '##[group]Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d',
      '##[error]Connect Timeout Error',
    ].join('\n')
    await expect(decide(makeCtx({ failedJobLogs: logsFor(log) }), RULES)).resolves.toEqual({
      decision: 'dispatch',
      matchedRule: '',
    })
  })

  it('does not match a connect timeout in a different step', async () => {
    const log = [
      '##[group]Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      '##[error]Connect Timeout Error',
      pathsFilterConnectTimeoutLog.replace(
        '##[error]Connect Timeout Error',
        'changed files listed',
      ),
    ].join('\n')
    await expect(decide(makeCtx({ failedJobLogs: logsFor(log) }), RULES)).resolves.toEqual({
      decision: 'dispatch',
      matchedRule: '',
    })
  })

  it('does not match a longer error that only contains the timeout text', async () => {
    const log = pathsFilterConnectTimeoutLog.replace(
      '##[error]Connect Timeout Error',
      '##[error]Connect Timeout Error while reading filter config',
    )
    await expect(decide(makeCtx({ failedJobLogs: logsFor(log) }), RULES)).resolves.toEqual({
      decision: 'dispatch',
      matchedRule: '',
    })
  })

  it('does not match a second error line', async () => {
    const log = `${pathsFilterConnectTimeoutLog}\n##[error]Process completed with exit code 1.`
    await expect(decide(makeCtx({ failedJobLogs: logsFor(log) }), RULES)).resolves.toEqual({
      decision: 'dispatch',
      matchedRule: '',
    })
  })

  it('does not match mixed annotations', async () => {
    await expect(
      decide(
        makeCtx({
          failedJobAnnotations: () =>
            Promise.resolve([connectTimeoutAnnotation, 'Process completed with exit code 1.']),
        }),
        RULES,
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('does not match when annotations are missing', async () => {
    await expect(
      decide(makeCtx({ failedJobAnnotations: () => Promise.resolve([]) }), RULES),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('does not match when another leaf job failed', async () => {
    await expect(
      decide(
        makeCtx({
          failedJobNames: [detectChangesJobName, 'test-cloudflare-worker'],
          jobConclusions: new Map([
            [detectChangesJobName, 'failure'],
            ['test-cloudflare-worker', 'failure'],
          ]),
        }),
        RULES,
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('does not match a cancelled detect-changes job', async () => {
    await expect(
      decide(
        makeCtx({
          jobConclusions: new Map([[detectChangesJobName, 'cancelled']]),
        }),
        RULES,
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('does not match a non-area workflow', async () => {
    await expect(
      decide(makeCtx({ workflowName: 'Main CI (cloudflare-worker)' }), RULES),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('does not match after the retry cap is exhausted', async () => {
    await expect(decide(makeCtx({ runAttempt: 2 }), RULES)).resolves.toEqual({
      decision: 'dispatch',
      matchedRule: '',
    })
  })
})
