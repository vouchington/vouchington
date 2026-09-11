import { describe, expect, it } from 'vitest'

import { buildWorkflowRunContext, fetchWorkflowRunSummary } from './run-context.mts'

describe('workflow run context', () => {
  it('fetches and validates workflow run metadata from GitHub', async () => {
    const calls: string[][] = []
    const execFile = async (_command: string, args: string[]) => {
      calls.push(args)
      return {
        stdout: JSON.stringify({
          conclusion: 'failure',
          name: 'CI',
          run_attempt: 2,
        }),
        stderr: '',
      }
    }

    await expect(
      fetchWorkflowRunSummary({
        repository: 'jonathanong/filaments',
        runId: '123',
        execFile,
      }),
    ).resolves.toEqual({
      conclusion: 'failure',
      runAttempt: 2,
      workflowName: 'CI',
    })
    expect(calls).toEqual([['api', 'repos/jonathanong/filaments/actions/runs/123']])
  })

  it('rejects non-object workflow run metadata from GitHub', async () => {
    const execFile = async () => ({ stdout: 'null', stderr: '' })

    await expect(
      fetchWorkflowRunSummary({
        repository: 'jonathanong/filaments',
        runId: '123',
        execFile,
      }),
    ).rejects.toThrow('Invalid workflow run response in GitHub API response for run 123')
  })

  it('builds a workflow run context with lazy failed-job logs and annotations', async () => {
    const calls: string[][] = []
    const execFile = async (_command: string, args: string[]) => {
      calls.push(args)
      const path = args.find(arg => arg.startsWith('repos/')) ?? args[1]
      if (path.includes('/attempts/1/jobs')) {
        return { stdout: JSON.stringify([{ jobs: [] }]), stderr: '' }
      }
      if (path.endsWith('/actions/runs/123/jobs')) {
        return {
          stdout: JSON.stringify([
            {
              jobs: [
                { name: 'build', id: 10, conclusion: 'success' },
                {
                  name: 'test',
                  id: 11,
                  conclusion: 'failure',
                  steps: [{ name: 'Run tests', number: 3, status: 'completed' }],
                },
              ],
            },
          ]),
          stderr: '',
        }
      }
      if (path.endsWith('/actions/jobs/11/logs')) {
        return { stdout: 'test failed with known transient', stderr: '' }
      }
      if (path.endsWith('/actions/jobs/10/logs')) return { stdout: 'build ok', stderr: '' }
      if (path.includes('/check-runs/11/annotations')) {
        return { stdout: JSON.stringify([[{ message: 'runner lost communication' }]]), stderr: '' }
      }
      throw new Error(`Unexpected gh api path: ${path}`)
    }

    const ctx = await buildWorkflowRunContext({
      conclusion: 'failure',
      repository: 'jonathanong/filaments',
      runAttempt: 2,
      runId: '123',
      workflowName: 'CI',
      execFile,
    })

    expect(ctx.ruleAttempt).toBe(1)
    expect(ctx.jobNames).toEqual(['build', 'test'])
    expect(ctx.jobIds).toEqual(
      new Map([
        ['build', 10],
        ['test', 11],
      ]),
    )
    expect(ctx.jobSteps?.get('test')).toEqual([
      { name: 'Run tests', number: 3, status: 'completed' },
    ])
    expect(ctx.failedJobNames).toEqual(['test'])
    expect(ctx.jobConclusions?.get('build')).toBe('success')
    await expect(ctx.failedJobLogs()).resolves.toEqual(
      new Map([['test', 'test failed with known transient']]),
    )
    await expect(ctx.jobLogs?.(['build', 'test', 'missing'])).resolves.toEqual(
      new Map([
        ['build', 'build ok'],
        ['test', 'test failed with known transient'],
        ['missing', ''],
      ]),
    )
    await expect(ctx.failedJobAnnotations('test')).resolves.toEqual(['runner lost communication'])
    expect(calls.filter(args => args[1].endsWith('/actions/jobs/11/logs'))).toHaveLength(1)
  })

  it('falls back to shared attempts when prior-attempt evidence cannot be replayed', async () => {
    const execFile = async (_command: string, args: string[]) => {
      const path = args.find(arg => arg.startsWith('repos/')) ?? args[1]
      if (path.includes('/attempts/1/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'apply', id: 12, conclusion: 'cancelled' }] }]),
          stderr: '',
        }
      }
      if (path.endsWith('/actions/runs/123/jobs')) {
        return {
          stdout: JSON.stringify([{ jobs: [{ name: 'test', id: 11, conclusion: 'failure' }] }]),
          stderr: '',
        }
      }
      if (path.includes('/check-runs/12/annotations')) throw new Error('missing annotations')
      throw new Error(`Unexpected gh api path: ${path}`)
    }

    const ctx = await buildWorkflowRunContext({
      conclusion: 'failure',
      repository: 'jonathanong/filaments',
      runAttempt: 2,
      runId: '123',
      workflowName: 'CI',
      execFile,
      rules: [
        {
          id: 'annotation-backed',
          consumerKey: 'test',
          rootCauseKey: 'annotation',
          description: 'annotation-backed test rule',
          rationale: 'test',
          maxAttempts: 1,
          needsAnnotations: true,
          match: async context =>
            (await context.failedJobAnnotations('apply')).includes('transient'),
        },
      ],
    })

    expect(ctx.ruleAttempt).toBe(2)
    expect(ctx.ruleAttempts).toBeUndefined()
  })
})
