import { describe, expect, it } from 'vitest'

import { deriveRuleAttempts } from './run-context-rule-attempts.mts'
import type { TransientRetryRule } from './types.mts'

const baseOptions = {
  repository: 'vouchington/vouchington',
  runId: '123',
  workflowName: 'CI',
}

describe('deriveRuleAttempts accounting', () => {
  it('gives a fingerprint first appearing on attempt 4 its first rule attempt', async () => {
    const execFile = async (_command: string, args: string[]) => ({
      stdout: JSON.stringify([
        {
          jobs: [
            {
              name: `unrelated-${args[1].match(/attempts\/(\d+)/)?.[1]}`,
              id: 10,
              conclusion: 'failure',
            },
          ],
        },
      ]),
      stderr: '',
    })
    const lateRule: TransientRetryRule = {
      id: 'late-first',
      consumerKey: 'test',
      rootCauseKey: 'late',
      description: 'late fingerprint',
      rationale: 'test',
      maxAttempts: 1,
      match: ctx => ctx.failedJobNames.includes('late'),
    }

    await expect(
      deriveRuleAttempts({
        ...baseOptions,
        execFile,
        priorAttemptJobCounts: [1, 1, 1],
        rules: [lateRule],
        runAttempt: 4,
      }),
    ).resolves.toEqual(new Map([['late-first', 1]]))
  })

  it('exhausts only the repeatedly matched rerun rule', async () => {
    const execFile = async () => ({
      stdout: JSON.stringify([{ jobs: [{ name: 'repeated', id: 10, conclusion: 'failure' }] }]),
      stderr: '',
    })
    const rules: TransientRetryRule[] = [
      {
        id: 'repeated',
        consumerKey: 'test',
        rootCauseKey: 'repeated',
        description: 'repeated fingerprint',
        rationale: 'test',
        maxAttempts: 2,
        match: ctx => ctx.failedJobNames.includes('repeated'),
      },
      {
        id: 'unrelated',
        consumerKey: 'test',
        rootCauseKey: 'unrelated',
        description: 'unrelated fingerprint',
        rationale: 'test',
        maxAttempts: 1,
        match: ctx => ctx.failedJobNames.includes('unrelated'),
      },
    ]

    await expect(
      deriveRuleAttempts({
        ...baseOptions,
        execFile,
        priorAttemptJobCounts: [1, 1, 1],
        rules,
        runAttempt: 4,
      }),
    ).resolves.toEqual(
      new Map([
        ['repeated', 3],
        ['unrelated', 1],
      ]),
    )
  })

  it('lets a later overlapping rule win after the earlier rule exhausts its cap', async () => {
    const execFile = async () => ({
      stdout: JSON.stringify([{ jobs: [{ name: 'overlap', id: 10, conclusion: 'failure' }] }]),
      stderr: '',
    })
    const makeRule = (id: string, maxAttempts: number): TransientRetryRule => ({
      id,
      consumerKey: 'test',
      rootCauseKey: id,
      description: `${id} overlapping fingerprint`,
      rationale: 'test',
      maxAttempts,
      match: ctx => ctx.failedJobNames.includes('overlap'),
    })

    await expect(
      deriveRuleAttempts({
        ...baseOptions,
        execFile,
        priorAttemptJobCounts: [1, 1, 1],
        rules: [makeRule('first', 1), makeRule('second', 2)],
        runAttempt: 4,
      }),
    ).resolves.toEqual(
      new Map([
        ['first', 2],
        ['second', 3],
      ]),
    )
  })

  it('does not fetch logs when a log-backed rule is skipped by its cap or guard', async () => {
    const calls: string[] = []
    const execFile = async (_command: string, args: string[]) => {
      calls.push(args[1])
      if (args[1].includes('/attempts/1/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'test', id: 11, conclusion: 'failure' }] }]),
          stderr: '',
        }
      }
      throw new Error(`Logs must remain lazy: ${args[1]}`)
    }
    const rules: TransientRetryRule[] = [
      {
        id: 'cap-skipped',
        consumerKey: 'test',
        rootCauseKey: 'log',
        description: 'cap-skipped log rule',
        rationale: 'test',
        maxAttempts: 0,
        needsLogs: true,
        match: async ctx => (await ctx.failedJobLogs()).has('test'),
      },
      {
        id: 'guard-skipped',
        consumerKey: 'test',
        rootCauseKey: 'log',
        description: 'guard-skipped log rule',
        rationale: 'test',
        maxAttempts: 1,
        needsLogs: true,
        match: async ctx => ctx.workflowName === 'Other' && (await ctx.failedJobLogs()).has('test'),
      },
    ]

    await expect(
      deriveRuleAttempts({
        ...baseOptions,
        execFile,
        priorAttemptJobCounts: [1],
        rules,
        runAttempt: 2,
      }),
    ).resolves.toEqual(
      new Map([
        ['cap-skipped', 1],
        ['guard-skipped', 1],
      ]),
    )
    expect(calls).toEqual(['repos/vouchington/vouchington/actions/runs/123/attempts/1/jobs'])
  })

  it('rejects replay when a matching rule accessed unavailable evidence', async () => {
    const execFile = async (_command: string, args: string[]) => {
      const path = args[1]
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
        ...baseOptions,
        execFile,
        priorAttemptJobCounts: [1],
        rules: [
          {
            id: 'matching-log-backed',
            consumerKey: 'test',
            rootCauseKey: 'log',
            description: 'matching log-backed test rule',
            rationale: 'test',
            maxAttempts: 1,
            needsLogs: true,
            match: async ctx => {
              await ctx.failedJobLogs()
              return true
            },
          },
        ],
        runAttempt: 2,
      }),
    ).rejects.toThrow('Cannot replay rule matching-log-backed')
  })
})
