import { describe, expect, it, vi } from 'vitest'

import { runDependabotRerun } from './revalidate-dependabot-rerun.mts'
import type { GhApiExecFile } from './transient-retry/gh-api.mts'

const REPOSITORY = 'vouchington/vouchington'
const RUN_ID = 33_307_398_209
const PR_NUMBER = 10_485
const HEAD_BRANCH = 'dependabot/npm_and_yarn/pnpm-10.17.1'
const HEAD_SHA = 'a'.repeat(40)
const RUN_STARTED_AT = '2026-08-30T12:00:00.000Z'
const NOW = Date.parse(RUN_STARTED_AT) + 60_000

const environment = {
  EVENT_HEAD_SHA: HEAD_SHA,
  GITHUB_REPOSITORY: REPOSITORY,
  HEAD_BRANCH,
  PR_NUMBER: String(PR_NUMBER),
  SOURCE_RUN_ATTEMPT: '2',
  SOURCE_RUN_CONCLUSION: 'cancelled',
  SOURCE_RUN_ID: String(RUN_ID),
}

const currentRun = {
  actor: { login: 'dependabot[bot]' },
  conclusion: 'cancelled',
  event: 'pull_request',
  head_branch: HEAD_BRANCH,
  head_repository: { full_name: REPOSITORY },
  head_sha: HEAD_SHA,
  id: RUN_ID,
  pull_requests: [{ number: PR_NUMBER }],
  repository: { full_name: REPOSITORY },
  run_attempt: 2,
  run_started_at: RUN_STARTED_AT,
  status: 'completed',
}

const currentPr = {
  head: {
    ref: HEAD_BRANCH,
    repo: { full_name: REPOSITORY },
    sha: HEAD_SHA,
  },
  number: PR_NUMBER,
  state: 'open',
  user: { login: 'dependabot[bot]' },
}

interface ExecOptions {
  pr?: unknown
  prApiError?: Error
  rerunError?: Error
  run?: unknown
  runApiError?: Error
  runRaw?: string
}

function makeExecFile(calls: string[][], options: ExecOptions = {}): GhApiExecFile {
  return vi.fn<GhApiExecFile>(async (_command, args) => {
    calls.push(args)
    if (args[0] === 'api' && args[1] === `repos/${REPOSITORY}/actions/runs/${RUN_ID}`) {
      if (options.runApiError) throw options.runApiError
      return {
        stderr: '',
        stdout: options.runRaw ?? JSON.stringify(options.run ?? currentRun),
      }
    }
    if (args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR_NUMBER}`) {
      if (options.prApiError) throw options.prApiError
      return { stderr: '', stdout: JSON.stringify(options.pr ?? currentPr) }
    }
    if (args[0] === 'run' && args[1] === 'rerun') {
      if (options.rerunError) throw options.rerunError
      return { stderr: '', stdout: '' }
    }
    throw new Error(`Unexpected command: gh ${args.join(' ')}`)
  })
}

function rerunCalls(calls: string[][]): string[][] {
  return calls.filter(args => args[0] === 'run' && args[1] === 'rerun')
}

describe('runDependabotRerun', () => {
  it('revalidates the source and live PR immediately before one full rerun', async () => {
    const calls: string[][] = []

    await expect(
      runDependabotRerun(environment, {
        execFile: makeExecFile(calls),
        now: () => NOW,
      }),
    ).resolves.toBe(0)

    expect(calls).toEqual([
      ['api', `repos/${REPOSITORY}/actions/runs/${RUN_ID}`],
      ['api', `repos/${REPOSITORY}/pulls/${PR_NUMBER}`],
      ['run', 'rerun', '--repo', REPOSITORY, String(RUN_ID)],
    ])
  })

  it.each([
    ['attempt changed', { run_attempt: 3 }, NOW],
    ['status changed', { status: 'in_progress' }, NOW],
    ['conclusion changed', { conclusion: 'failure' }, NOW],
    ['source aged out', {}, Date.parse(RUN_STARTED_AT) + 49 * 60 * 60 * 1000],
  ])('successfully suppresses a rerun when the source %s', async (_name, change, now) => {
    const calls: string[][] = []

    await expect(
      runDependabotRerun(environment, {
        execFile: makeExecFile(calls, { run: { ...currentRun, ...change } }),
        now: () => now,
      }),
    ).resolves.toBe(0)

    expect(calls).toHaveLength(1)
    expect(rerunCalls(calls)).toEqual([])
  })

  it('suppresses the stale old-SHA rerun when Dependabot advances the PR head', async () => {
    const calls: string[][] = []
    const movedSha = 'b'.repeat(40)

    await expect(
      runDependabotRerun(environment, {
        execFile: makeExecFile(calls, {
          pr: { ...currentPr, head: { ...currentPr.head, sha: movedSha } },
        }),
        now: () => NOW,
      }),
    ).resolves.toBe(0)

    expect(rerunCalls(calls)).toEqual([])
  })

  it('suppresses a rerun after the Dependabot PR closes', async () => {
    const calls: string[][] = []

    await expect(
      runDependabotRerun(environment, {
        execFile: makeExecFile(calls, { pr: { ...currentPr, state: 'closed' } }),
        now: () => NOW,
      }),
    ).resolves.toBe(0)

    expect(rerunCalls(calls)).toEqual([])
  })

  it.each([
    ['source actor', { run: { ...currentRun, actor: { login: 'octocat' } } }],
    [
      'source repository',
      {
        run: {
          ...currentRun,
          head_repository: { full_name: 'fork/filaments' },
        },
      },
    ],
    ['source branch', { run: { ...currentRun, head_branch: 'dependabot/npm_and_yarn/other' } }],
    [
      'source PR association',
      { run: { ...currentRun, pull_requests: [{ number: PR_NUMBER + 1 }] } },
    ],
    [
      'ambiguous source PR association',
      {
        run: {
          ...currentRun,
          pull_requests: [{ number: PR_NUMBER }, { number: PR_NUMBER + 1 }],
        },
      },
    ],
    ['live PR author', { pr: { ...currentPr, user: { login: 'octocat' } } }],
    [
      'live PR repository',
      {
        pr: {
          ...currentPr,
          head: { ...currentPr.head, repo: { full_name: 'fork/filaments' } },
        },
      },
    ],
    [
      'live PR branch',
      {
        pr: {
          ...currentPr,
          head: { ...currentPr.head, ref: 'dependabot/npm_and_yarn/other' },
        },
      },
    ],
    [
      'live PR head SHA',
      {
        pr: {
          ...currentPr,
          head: { ...currentPr.head, sha: null },
        },
      },
    ],
    ['closed PR with unverified identity', { pr: { state: 'closed' } }],
  ])('fails closed for an invalid %s', async (_name, options) => {
    const calls: string[][] = []

    await expect(
      runDependabotRerun(environment, {
        execFile: makeExecFile(calls, options),
        now: () => NOW,
      }),
    ).resolves.toBe(1)

    expect(rerunCalls(calls)).toEqual([])
  })

  it.each([
    ['missing inputs', {}, {}],
    ['malformed source response', environment, { runRaw: '{' }],
    ['source API failure', environment, { runApiError: new Error('GitHub API unavailable') }],
    ['pull request API failure', environment, { prApiError: new Error('GitHub API unavailable') }],
  ])('fails closed for %s', async (_name, env, options) => {
    const calls: string[][] = []

    await expect(
      runDependabotRerun(env, {
        execFile: makeExecFile(calls, options),
        now: () => NOW,
      }),
    ).resolves.toBe(1)

    expect(rerunCalls(calls)).toEqual([])
  })

  it('returns failure without retrying a failed rerun mutation', async () => {
    const calls: string[][] = []

    await expect(
      runDependabotRerun(environment, {
        execFile: makeExecFile(calls, { rerunError: new Error('rerun denied') }),
        now: () => NOW,
      }),
    ).resolves.toBe(1)

    expect(rerunCalls(calls)).toHaveLength(1)
  })
})
