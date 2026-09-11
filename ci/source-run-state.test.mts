import { describe, expect, it, vi } from 'vitest'

import {
  fetchSourceRunState,
  runSourceStateCheck,
  sourceStateExitCode,
  type ExpectedSourceRun,
  type SourceRunState,
} from './source-run-state.mts'
import type { GhApiExecFile } from './transient-retry/gh-api.mts'

const expected: ExpectedSourceRun = {
  conclusion: 'failure',
  repository: 'jonathanong/filaments',
  runAttempt: 1,
  runId: 30_503_060_858,
}

const RUN_STARTED_AT = '2026-08-01T00:00:00.000Z'
const NOW = Date.parse(RUN_STARTED_AT) + 60_000

const currentRun = {
  conclusion: 'failure',
  id: 30_503_060_858,
  repository: { full_name: 'jonathanong/filaments' },
  run_attempt: 1,
  run_started_at: RUN_STARTED_AT,
  status: 'completed',
}

describe('fetchSourceRunState', () => {
  it('requests the exact repository run', async () => {
    const execFile = vi.fn<GhApiExecFile>(async () => ({
      stderr: '',
      stdout: JSON.stringify(currentRun),
    }))

    await expect(fetchSourceRunState(expected, { execFile, now: () => NOW })).resolves.toEqual({
      current: true,
      reason: 'current-failed-attempt',
    })
    expect(execFile).toHaveBeenCalledWith(
      'gh',
      ['api', 'repos/jonathanong/filaments/actions/runs/30503060858'],
      expect.objectContaining({ maxBuffer: expect.any(Number) }),
    )
  })

  it('fails closed when the GitHub API is unavailable', async () => {
    const execFile = vi.fn<GhApiExecFile>(async () => {
      throw new Error('GitHub API unavailable')
    })

    await expect(fetchSourceRunState(expected, { execFile })).resolves.toEqual({
      current: false,
      reason: 'api-error',
    })
  })

  it('fails closed when the GitHub API returns malformed JSON', async () => {
    const execFile = vi.fn<GhApiExecFile>(async () => ({ stderr: '', stdout: '{' }))

    await expect(fetchSourceRunState(expected, { execFile })).resolves.toEqual({
      current: false,
      reason: 'malformed-response',
    })
  })

  it('suppresses a source run older than the 48h age bound, without hard-failing', async () => {
    const execFile = vi.fn<GhApiExecFile>(async () => ({
      stderr: '',
      stdout: JSON.stringify(currentRun),
    }))
    const wellPast48h = Date.parse(RUN_STARTED_AT) + 49 * 60 * 60 * 1000

    await expect(
      fetchSourceRunState(expected, { execFile, now: () => wellPast48h }),
    ).resolves.toEqual({
      current: false,
      reason: 'stale-source-run',
    })
  })
})

describe('runSourceStateCheck', () => {
  it('reads workflow inputs and writes the dispatch-gate outputs', async () => {
    const execFile = vi.fn<GhApiExecFile>(async () => ({
      stderr: '',
      stdout: JSON.stringify(currentRun),
    }))
    const writes: string[] = []

    await expect(
      runSourceStateCheck(
        {
          GITHUB_OUTPUT: '/tmp/github-output',
          GITHUB_REPOSITORY: expected.repository,
          SOURCE_RUN_ATTEMPT: String(expected.runAttempt),
          SOURCE_RUN_CONCLUSION: expected.conclusion,
          SOURCE_RUN_ID: String(expected.runId),
        },
        {
          appendOutput: (_path, data) => writes.push(data),
          execFile,
          now: () => NOW,
        },
      ),
    ).resolves.toEqual({ current: true, reason: 'current-failed-attempt' })
    expect(writes).toEqual(['current=true\nreason=current-failed-attempt\n'])
  })

  it('writes a fail-closed output for invalid workflow inputs', async () => {
    const writes: string[] = []

    await expect(
      runSourceStateCheck(
        { GITHUB_OUTPUT: '/tmp/github-output' },
        { appendOutput: (_path, data) => writes.push(data) },
      ),
    ).resolves.toEqual({ current: false, reason: 'invalid-input' })
    expect(writes).toEqual(['current=false\nreason=invalid-input\n'])
  })
})

describe('sourceStateExitCode', () => {
  it.each([
    'api-error',
    'invalid-input',
    'malformed-response',
    'repository-mismatch',
    'run-id-mismatch',
  ] satisfies SourceRunState['reason'][])('fails for uncertain source state: %s', reason => {
    expect(sourceStateExitCode({ current: false, reason })).toBe(1)
  })

  it.each([
    'conclusion-changed',
    'run-attempt-changed',
    'stale-source-run',
    'status-changed',
  ] satisfies SourceRunState['reason'][])(
    'successfully suppresses verified stale state: %s',
    reason => {
      expect(sourceStateExitCode({ current: false, reason })).toBe(0)
    },
  )
})
