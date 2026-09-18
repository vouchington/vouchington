import { describe, expect, it } from 'vitest'

import { decide } from './decision-evaluator.mts'
import { deriveRuleAttempts } from './run-context-rule-attempts.mts'
import type { TransientRetryRule } from './types.mts'

describe('deriveRuleAttempts', () => {
  it('counts annotation-backed and zero-job prior matches', async () => {
    const calls: string[][] = []
    const execFile = async (_command: string, args: string[]) => {
      calls.push(args)
      const path = args.find(arg => arg.startsWith('repos/')) ?? args[1]
      if (path.includes('/attempts/1/jobs')) {
        return {
          stdout: JSON.stringify([
            { jobs: [{ name: 'apply / apply', id: 10, conclusion: 'cancelled' }] },
          ]),
          stderr: '',
        }
      }
      if (path.includes('/attempts/2/jobs')) {
        return { stdout: JSON.stringify([{ jobs: [] }]), stderr: '' }
      }
      if (path.includes('/check-runs/10/annotations')) {
        return {
          stdout: JSON.stringify([
            [
              {
                message:
                  'Canceling since a higher priority waiting request for shared-staging-state-lock exists',
              },
            ],
          ]),
          stderr: '',
        }
      }
      throw new Error(`Unexpected gh api path: ${path}`)
    }
    const rules: TransientRetryRule[] = [
      {
        id: 'annotated',
        consumerKey: 'test',
        rootCauseKey: 'annotation',
        description: 'annotation-backed test rule',
        rationale: 'test',
        maxAttempts: 1,
        match: async ctx =>
          (await ctx.failedJobAnnotations('apply / apply')).some(message =>
            message.includes('shared-staging-state-lock'),
          ),
      },
      {
        id: 'jobless',
        consumerKey: 'test',
        rootCauseKey: 'jobless',
        description: 'zero-job test rule',
        rationale: 'test',
        maxAttempts: 1,
        match: ctx => ctx.conclusion === 'cancelled' && ctx.jobNames?.length === 0,
      },
    ]

    await expect(
      deriveRuleAttempts({
        execFile,
        priorAttemptJobCounts: [1, 0],
        repository: 'vouchington/vouchington',
        rules,
        runAttempt: 3,
        runId: '123',
        workflowName: 'Main CI (checks)',
      }),
    ).resolves.toEqual(
      new Map([
        ['annotated', 2],
        ['jobless', 2],
      ]),
    )
    expect(calls.some(args => args.some(arg => arg.includes('/check-runs/10/annotations')))).toBe(
      true,
    )
  })

  it('rejects replay when an unmatched log-backed rule cannot fetch logs', async () => {
    const execFile = async (_command: string, args: string[]) => {
      const path = args.find(arg => arg.startsWith('repos/')) ?? args[1]
      if (path.includes('/attempts/1/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'test', id: 11, conclusion: 'failure' }] }]),
          stderr: '',
        }
      }
      if (path.endsWith('/actions/jobs/11/logs')) throw new Error('missing logs')
      throw new Error(`Unexpected gh api path: ${path}`)
    }

    await expect(
      deriveRuleAttempts({
        execFile,
        priorAttemptJobCounts: [1],
        repository: 'vouchington/vouchington',
        rules: [
          {
            id: 'log-backed',
            consumerKey: 'test',
            rootCauseKey: 'log',
            description: 'log-backed test rule',
            rationale: 'test',
            maxAttempts: 1,
            needsLogs: true,
            match: async ctx =>
              (await ctx.failedJobLogs()).get('test')?.includes('transient') ?? false,
          },
        ],
        runAttempt: 2,
        runId: '123',
        workflowName: 'CI',
      }),
    ).rejects.toThrow('Cannot replay rule log-backed')
  })

  it('rejects replay when an unmatched annotation-backed rule cannot fetch annotations', async () => {
    const execFile = async (_command: string, args: string[]) => {
      const path = args.find(arg => arg.startsWith('repos/')) ?? args[1]
      if (path.includes('/attempts/1/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'apply', id: 12, conclusion: 'cancelled' }] }]),
          stderr: '',
        }
      }
      if (path.includes('/check-runs/12/annotations')) throw new Error('missing annotations')
      throw new Error(`Unexpected gh api path: ${path}`)
    }

    await expect(
      deriveRuleAttempts({
        execFile,
        priorAttemptJobCounts: [1],
        repository: 'vouchington/vouchington',
        rules: [
          {
            id: 'annotation-backed',
            consumerKey: 'test',
            rootCauseKey: 'annotation',
            description: 'annotation-backed test rule',
            rationale: 'test',
            maxAttempts: 1,
            needsAnnotations: true,
            match: async ctx => (await ctx.failedJobAnnotations('apply')).includes('transient'),
          },
        ],
        runAttempt: 2,
        runId: '123',
        workflowName: 'CI',
      }),
    ).rejects.toThrow('Cannot replay rule annotation-backed')
  })

  it('retains a known rule prefix when later replay log evidence becomes unavailable', async () => {
    const execFile = async (_command: string, args: string[]) => {
      const path = args.find(arg => arg.startsWith('repos/')) ?? args[1]
      if (path.includes('/attempts/1/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'test', id: 11, conclusion: 'failure' }] }]),
          stderr: '',
        }
      }
      if (path.includes('/attempts/2/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'test', id: 12, conclusion: 'failure' }] }]),
          stderr: '',
        }
      }
      if (path.endsWith('/actions/jobs/11/logs')) return { stdout: 'ordinary failure', stderr: '' }
      if (path.endsWith('/actions/jobs/12/logs')) throw new Error('missing logs')
      throw new Error(`Unexpected gh api path: ${path}`)
    }
    const rules: TransientRetryRule[] = [
      {
        id: 'credentialed-prefix',
        consumerKey: 'test',
        rootCauseKey: 'test',
        description: 'known prefix rule',
        rationale: 'test',
        maxAttempts: 1,
        match: ctx => ctx.runAttempt === 3,
      },
      {
        id: 'coverage-later',
        consumerKey: 'test',
        rootCauseKey: 'test',
        description: 'later log-backed rule',
        rationale: 'test',
        maxAttempts: 1,
        needsLogs: true,
        match: async ctx => {
          await ctx.failedJobLogs()
          return ctx.runAttempt === 999
        },
      },
    ]

    const ruleAttempts = await deriveRuleAttempts({
      execFile,
      priorAttemptJobCounts: [1, 1],
      repository: 'vouchington/vouchington',
      rules,
      runAttempt: 3,
      runId: '123',
      workflowName: 'CI',
    })

    expect(ruleAttempts).toEqual(new Map([['credentialed-prefix', 1]]))
    await expect(
      decide(
        {
          workflowName: 'CI',
          conclusion: 'failure',
          runAttempt: 3,
          ruleAttempts,
          failedJobNames: ['test'],
          failedJobLogs: () => Promise.resolve(new Map([['test', 'ordinary failure']])),
          failedJobAnnotations: () => Promise.resolve([]),
        },
        rules,
      ),
    ).resolves.toMatchObject({ decision: 'rerun', matchedRule: 'credentialed-prefix' })
  })

  it('replays later prior attempts using only the known prefix', async () => {
    const execFile = async (_command: string, args: string[]) => {
      const path = args.find(arg => arg.startsWith('repos/')) ?? args[1]
      if (path.includes('/attempts/1/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'test', id: 11, conclusion: 'failure' }] }]),
          stderr: '',
        }
      }
      if (path.includes('/attempts/2/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'test', id: 12, conclusion: 'failure' }] }]),
          stderr: '',
        }
      }
      if (path.includes('/attempts/3/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'test', id: 13, conclusion: 'failure' }] }]),
          stderr: '',
        }
      }
      if (path.endsWith('/actions/jobs/11/logs')) return { stdout: 'ordinary failure', stderr: '' }
      if (path.endsWith('/actions/jobs/12/logs')) throw new Error('missing logs')
      if (path.endsWith('/actions/jobs/13/logs')) throw new Error('suffix must not replay')
      throw new Error(`Unexpected gh api path: ${path}`)
    }
    const rules: TransientRetryRule[] = [
      {
        id: 'known-prefix',
        consumerKey: 'test',
        rootCauseKey: 'test',
        description: 'known prefix rule',
        rationale: 'test',
        maxAttempts: 1,
        match: () => false,
      },
      {
        id: 'unavailable-suffix',
        consumerKey: 'test',
        rootCauseKey: 'test',
        description: 'later log-backed rule',
        rationale: 'test',
        maxAttempts: 1,
        needsLogs: true,
        match: async ctx => {
          await ctx.failedJobLogs()
          return false
        },
      },
    ]

    await expect(
      deriveRuleAttempts({
        execFile,
        priorAttemptJobCounts: [1, 1, 1],
        repository: 'vouchington/vouchington',
        rules,
        runAttempt: 4,
        runId: '123',
        workflowName: 'CI',
      }),
    ).resolves.toEqual(new Map([['known-prefix', 1]]))
  })
})
