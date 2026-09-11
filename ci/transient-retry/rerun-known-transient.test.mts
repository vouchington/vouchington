import { describe, expect, it } from 'vitest'

import type { DecisionResult } from './decide.mts'
import type { GhApiExecFile } from './gh-api.mts'
import { main, parseArgs } from './rerun-known-transient.mts'
import type { WorkflowRunContext } from './rules.mts'

function makeExecFile(calls: string[][]): GhApiExecFile {
  return async (_command, args) => {
    calls.push(args)
    if (args.join(' ') === 'repo view --json nameWithOwner --jq .nameWithOwner') {
      return { stdout: 'jonathanong/filaments\n', stderr: '' }
    }

    const path = args[1]
    if (args[0] !== 'api') {
      return { stdout: '', stderr: '' }
    }
    if (path === 'repos/jonathanong/filaments/actions/runs/123') {
      return {
        stdout: JSON.stringify({
          conclusion: 'failure',
          name: 'CI',
          run_attempt: 1,
        }),
        stderr: '',
      }
    }
    if (path === 'repos/jonathanong/filaments/actions/runs/456') {
      return {
        stdout: JSON.stringify({
          conclusion: 'success',
          name: 'CI',
          run_attempt: 1,
        }),
        stderr: '',
      }
    }
    if (path.includes('/attempts/')) {
      return { stdout: JSON.stringify([{ jobs: [] }]), stderr: '' }
    }
    if (path === 'repos/jonathanong/filaments/actions/runs/123/jobs') {
      return {
        stdout: JSON.stringify([
          {
            jobs: [
              { name: 'test-web / web-tests (1)', id: 10, conclusion: 'failure' },
              { name: 'tests', id: 11, conclusion: 'failure' },
            ],
          },
        ]),
        stderr: '',
      }
    }
    throw new Error(`Unexpected command: ${args.join(' ')}`)
  }
}

const alwaysDecision =
  (decision: DecisionResult): typeof import('./decide.mts').decide =>
  async (_ctx: WorkflowRunContext) =>
    decision

describe('parseArgs()', () => {
  it('uses GITHUB_REPOSITORY as the default repository', () => {
    expect(parseArgs(['123'], { GITHUB_REPOSITORY: 'jonathanong/filaments' })).toEqual({
      dryRun: false,
      repository: 'jonathanong/filaments',
      runId: '123',
    })
  })

  it('accepts explicit repository and dry-run options', () => {
    expect(parseArgs(['--dry-run', '--repo', 'owner/repo', '123'], {})).toEqual({
      dryRun: true,
      repository: 'owner/repo',
      runId: '123',
    })
  })

  it('allows main to infer the repository when no default is set', () => {
    expect(parseArgs(['123'], {})).toEqual({
      dryRun: false,
      repository: undefined,
      runId: '123',
    })
  })
})

describe('rerun-known-transient main()', () => {
  it('reruns when the transient catalogue returns a rerun decision', async () => {
    const calls: string[][] = []
    const logs: string[] = []

    const exitCode = await main(
      ['123'],
      { GITHUB_REPOSITORY: 'jonathanong/filaments' },
      {
        decideRun: alwaysDecision({ decision: 'rerun', matchedRule: 'known-runner-flake' }),
        execFile: makeExecFile(calls),
        log: message => logs.push(message),
      },
    )

    expect(exitCode).toBe(0)
    expect(calls).toContainEqual(['run', 'rerun', '--repo', 'jonathanong/filaments', '123'])
    expect(logs).toContain('Decision: rerun')
    expect(logs).toContain('Matched rule: known-runner-flake')
    expect(logs).toContain('Requested rerun for run 123.')
  })

  it('reruns only the selected job when the decision contains a target', async () => {
    const calls: string[][] = []
    const exitCode = await main(
      ['123'],
      { GITHUB_REPOSITORY: 'jonathanong/filaments' },
      {
        decideRun: alwaysDecision({
          decision: 'rerun',
          matchedRule: 'targeted',
          rerunJobId: 456,
        }),
        execFile: makeExecFile(calls),
        log: () => undefined,
      },
    )
    expect(exitCode).toBe(0)
    expect(calls).toContainEqual([
      'run',
      'rerun',
      '--repo',
      'jonathanong/filaments',
      '--job',
      '456',
    ])
  })

  it('reports the selected job in targeted dry-run mode', async () => {
    const logs: string[] = []
    const exitCode = await main(
      ['123', '--dry-run'],
      { GITHUB_REPOSITORY: 'jonathanong/filaments' },
      {
        decideRun: alwaysDecision({
          decision: 'rerun',
          matchedRule: 'targeted',
          rerunJobId: 456,
        }),
        execFile: makeExecFile([]),
        log: message => logs.push(message),
      },
    )
    expect(exitCode).toBe(0)
    expect(logs).toContain('Dry run: would run gh run rerun --repo jonathanong/filaments --job 456')
  })

  it('infers the repository from the local checkout', async () => {
    const calls: string[][] = []

    const exitCode = await main(
      ['123', '--dry-run'],
      {},
      {
        decideRun: alwaysDecision({ decision: 'rerun', matchedRule: 'known-runner-flake' }),
        execFile: makeExecFile(calls),
        log: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(calls).toContainEqual([
      'repo',
      'view',
      '--json',
      'nameWithOwner',
      '--jq',
      '.nameWithOwner',
    ])
    expect(calls).toContainEqual(['api', 'repos/jonathanong/filaments/actions/runs/123'])
  })

  it('does not rerun in dry-run mode', async () => {
    const calls: string[][] = []
    const logs: string[] = []

    const exitCode = await main(
      ['123', '--dry-run'],
      { GITHUB_REPOSITORY: 'jonathanong/filaments' },
      {
        decideRun: alwaysDecision({ decision: 'rerun', matchedRule: 'known-runner-flake' }),
        execFile: makeExecFile(calls),
        log: message => logs.push(message),
      },
    )

    expect(exitCode).toBe(0)
    expect(calls).not.toContainEqual(['run', 'rerun', '--repo', 'jonathanong/filaments', '123'])
    expect(logs).toContain('Dry run: would run gh run rerun --repo jonathanong/filaments 123')
  })

  it('returns 2 and does not rerun when the decision is not rerun', async () => {
    const calls: string[][] = []
    const logs: string[] = []

    const exitCode = await main(
      ['123'],
      { GITHUB_REPOSITORY: 'jonathanong/filaments' },
      {
        decideRun: alwaysDecision({ decision: 'dispatch', matchedRule: '' }),
        execFile: makeExecFile(calls),
        log: message => logs.push(message),
      },
    )

    expect(exitCode).toBe(2)
    expect(calls).not.toContainEqual(['run', 'rerun', '--repo', 'jonathanong/filaments', '123'])
    expect(logs).toContain("No rerun requested: decision is 'dispatch', not 'rerun'.")
  })

  it('returns 2 for non-failed workflow runs before fetching jobs', async () => {
    const calls: string[][] = []
    const logs: string[] = []

    const exitCode = await main(
      ['456'],
      { GITHUB_REPOSITORY: 'jonathanong/filaments' },
      {
        decideRun: alwaysDecision({ decision: 'rerun', matchedRule: 'should-not-run' }),
        execFile: makeExecFile(calls),
        log: message => logs.push(message),
      },
    )

    expect(exitCode).toBe(2)
    expect(calls).toEqual([['api', 'repos/jonathanong/filaments/actions/runs/456']])
    expect(logs).toContain(
      'Run conclusion is not failure, timed_out, or cancelled; no rerun requested.',
    )
  })
})
