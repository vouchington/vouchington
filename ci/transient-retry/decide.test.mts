import { describe, expect, it } from 'vitest'

import { fetchPriorAttemptJobCounts, parseWorkflowJobEntries } from './attempts.mts'
import { decide } from './decide.mts'
import { parseDecisionEnv } from './env.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

type RerunTransientRetryRule = Extract<TransientRetryRule, { decision?: 'rerun' }>

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

const alwaysMatchRule = (id: string, maxAttempts = 1): RerunTransientRetryRule => ({
  id,
  consumerKey: `consumer-${id}`,
  rootCauseKey: `root-cause-${id}`,
  description: `Always-match rule ${id}`,
  rationale: 'Test fixture',
  maxAttempts,
  match: () => true,
})

const neverMatchRule = (id: string, maxAttempts = 1): RerunTransientRetryRule => ({
  id,
  consumerKey: `consumer-${id}`,
  rootCauseKey: `root-cause-${id}`,
  description: `Never-match rule ${id}`,
  rationale: 'Test fixture',
  maxAttempts,
  match: () => false,
})

const asyncMatchRule = (id: string, result: boolean, maxAttempts = 1): RerunTransientRetryRule => ({
  id,
  consumerKey: `consumer-${id}`,
  rootCauseKey: `root-cause-${id}`,
  description: `Async rule ${id}`,
  rationale: 'Test fixture',
  maxAttempts,
  match: () => Promise.resolve(result),
})

describe('decide()', () => {
  it('reads and validates the CLI environment', () => {
    expect(
      parseDecisionEnv({
        CONCLUSION: 'failure',
        GH_TOKEN: 'token',
        GITHUB_OUTPUT: '/tmp/out',
        GITHUB_REPOSITORY: 'jonathanong/filaments',
        RUN_ATTEMPT: '2',
        WORKFLOW_NAME: 'Main CI (storybook)',
        WORKFLOW_RUN_ID: '28023619770',
      }),
    ).toEqual({
      conclusion: 'failure',
      githubOutput: '/tmp/out',
      repository: 'jonathanong/filaments',
      runAttempt: 2,
      runId: '28023619770',
      workflowName: 'Main CI (storybook)',
    })
  })

  it('rejects invalid CLI run attempts', () => {
    expect(() =>
      parseDecisionEnv({
        CONCLUSION: 'failure',
        GH_TOKEN: 'token',
        GITHUB_REPOSITORY: 'jonathanong/filaments',
        RUN_ATTEMPT: '0',
        WORKFLOW_NAME: 'Main CI (storybook)',
        WORKFLOW_RUN_ID: '28023619770',
      }),
    ).toThrow('Invalid RUN_ATTEMPT: "0" (expected a positive integer)')
  })

  it('parses paginated workflow job pages from gh api --slurp output', () => {
    const entries = parseWorkflowJobEntries(
      JSON.stringify([
        {
          jobs: [
            { name: 'test-a', id: 101, conclusion: 'success' },
            { name: 'test-b', id: 102, conclusion: 'failure' },
          ],
        },
        {
          jobs: [{ name: 'test-c', id: 103, conclusion: 'cancelled' }],
        },
      ]),
    )

    expect(entries).toEqual([
      { name: 'test-a', id: 101, conclusion: 'success' },
      { name: 'test-b', id: 102, conclusion: 'failure' },
      { name: 'test-c', id: 103, conclusion: 'cancelled' },
    ])
  })

  it('fetches prior workflow attempt job counts through the retrying GitHub API helper', async () => {
    const calls: string[][] = []
    const originalConsoleError = console.error
    console.error = () => {}
    const execFile = async (_command: string, args: string[]) => {
      calls.push(args)
      if (args.includes('repos/jonathanong/filaments/actions/runs/123/attempts/1/jobs')) {
        throw Object.assign(new Error('dial tcp 140.82.114.6:443: i/o timeout'), {
          stderr: 'dial tcp 140.82.114.6:443: i/o timeout',
        })
      }
      return { stdout: JSON.stringify([{ jobs: [{ name: 'build', id: 1 }] }]), stderr: '' }
    }

    try {
      await expect(
        fetchPriorAttemptJobCounts({
          repository: 'jonathanong/filaments',
          runId: '123',
          runAttempt: 3,
          execFile,
          sleep: () => Promise.resolve(),
        }),
      ).resolves.toEqual([null, 1])
    } finally {
      console.error = originalConsoleError
    }
    expect(
      calls.filter(args =>
        args.includes('repos/jonathanong/filaments/actions/runs/123/attempts/1/jobs'),
      ),
    ).toHaveLength(3)
    expect(
      calls.filter(args =>
        args.includes('repos/jonathanong/filaments/actions/runs/123/attempts/2/jobs'),
      ),
    ).toHaveLength(1)
    expect(
      calls.every(
        args => args[0] === 'api' && args.at(-2) === '--paginate' && args.at(-1) === '--slurp',
      ),
    ).toBe(true)
  })

  it('returns rerun when the first matching rule is found', async () => {
    const ctx = makeCtx()
    const rules = [alwaysMatchRule('first'), alwaysMatchRule('second')]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('first')
  })

  it('returns ignore when the first matching rule is an ignore rule', async () => {
    const ctx = makeCtx()
    const rules: TransientRetryRule[] = [
      { ...alwaysMatchRule('ignored'), decision: 'ignore', rerunTarget: undefined },
      alwaysMatchRule('rerun'),
    ]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('ignore')
    expect(result.matchedRule).toBe('ignored')
  })

  it('first-match-wins: reports only the first matching rule id, ignores subsequent matches', async () => {
    const ctx = makeCtx()
    const rules = [alwaysMatchRule('winner'), alwaysMatchRule('loser')]
    const result = await decide(ctx, rules)
    expect(result.matchedRule).toBe('winner')
  })

  it('skips rules where maxAttempts < runAttempt and falls through to next rule', async () => {
    const ctx = makeCtx({ runAttempt: 2 })
    // First rule matches predicate but maxAttempts: 1 < runAttempt: 2 → skip
    const rules = [alwaysMatchRule('capped', 1), alwaysMatchRule('uncapped', 3)]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('uncapped')
  })

  it('uses ruleAttempt instead of raw runAttempt for retry caps when provided', async () => {
    const ctx = makeCtx({ runAttempt: 2, ruleAttempt: 1 })
    const rules = [alwaysMatchRule('discounted', 1)]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('discounted')
  })

  it('returns rerun when maxAttempts is met exactly (maxAttempts === runAttempt) → still matches', async () => {
    const ctx = makeCtx({ runAttempt: 1 })
    const rules = [alwaysMatchRule('exact', 1)]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('exact')
  })

  it('returns dispatch with empty matchedRule when no rule matches', async () => {
    const ctx = makeCtx()
    const rules = [neverMatchRule('no-match')]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('returns dispatch with empty matchedRule when rules list is empty', async () => {
    const ctx = makeCtx()
    const result = await decide(ctx, [])
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('handles async rules that return true correctly', async () => {
    const ctx = makeCtx()
    const rules = [asyncMatchRule('async-match', true)]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('async-match')
  })

  it('handles async rules that return false correctly', async () => {
    const ctx = makeCtx()
    const rules = [asyncMatchRule('async-no-match', false)]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('evaluates rules in array order — first sync match wins over later async match', async () => {
    const ctx = makeCtx()
    const rules = [alwaysMatchRule('sync-first'), asyncMatchRule('async-second', true)]
    const result = await decide(ctx, rules)
    expect(result.matchedRule).toBe('sync-first')
  })

  it('skips all capped rules when runAttempt exceeds all maxAttempts → dispatch', async () => {
    const ctx = makeCtx({ runAttempt: 5 })
    const rules = [alwaysMatchRule('capped-1', 1), alwaysMatchRule('capped-2', 2)]
    const result = await decide(ctx, rules)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
