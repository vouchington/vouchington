import { describe, expect, it } from 'vitest'

import {
  ghApi,
  ghApiLogArgs,
  type GhApiExecFile,
  isRetryableGhApiError,
  LOG_MAX_BUFFER_BYTES,
} from './gh-api.mts'

function makeTransportError(message: string): Error & { stderr: string } {
  const error = new Error(message) as Error & { stderr: string }
  error.stderr = message
  return error
}

describe('ghApiLogArgs()', () => {
  it('opts into ANSI-safe job log output', () => {
    expect(ghApiLogArgs('repos/owner/repo/actions/jobs/1/logs')).toEqual([
      'api',
      '--allow-escape-sequences',
      'repos/owner/repo/actions/jobs/1/logs',
    ])
  })
})

describe('ghApi()', () => {
  it('keeps enough buffer for verbose Storybook browser logs', () => {
    expect(LOG_MAX_BUFFER_BYTES).toBeGreaterThanOrEqual(64 * 1024 * 1024)
  })

  it('retries retryable GitHub API transport failures', async () => {
    const calls: string[][] = []
    const sleepMs: number[] = []
    const warnings: string[] = []
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '))
    }
    const execFile: GhApiExecFile = async (_command, args) => {
      calls.push(args)
      if (calls.length === 1) {
        throw makeTransportError(
          'Get "https://api.github.com/repos/jonathanong/filaments/actions/runs/1/jobs": net/http: TLS handshake timeout',
        )
      }
      return { stdout: '{"ok":true}', stderr: '' }
    }

    try {
      await expect(
        ghApi(['repos/jonathanong/filaments/actions/runs/1/jobs'], {
          execFile,
          maxBuffer: 123,
          sleep: ms => {
            sleepMs.push(ms)
            return Promise.resolve()
          },
        }),
      ).resolves.toEqual({ stdout: '{"ok":true}', stderr: '' })
    } finally {
      console.error = originalConsoleError
    }
    expect(calls).toEqual([
      ['api', 'repos/jonathanong/filaments/actions/runs/1/jobs'],
      ['api', 'repos/jonathanong/filaments/actions/runs/1/jobs'],
    ])
    expect(sleepMs).toEqual([1000])
    expect(warnings).toEqual([
      '::warning::gh api attempt 1/3 failed (Get "https://api.github.com/repos/jonathanong/filaments/actions/runs/1/jobs": net/http: TLS handshake timeout); retrying',
    ])
  })

  it('does not retry non-transport GitHub API failures', async () => {
    let calls = 0
    const error = makeTransportError('HTTP 404: Not Found')
    const execFile: GhApiExecFile = async () => {
      calls += 1
      throw error
    }

    await expect(
      ghApi(['repos/jonathanong/filaments/actions/runs/missing/jobs'], {
        execFile,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toBe(error)
    expect(calls).toBe(1)
  })
})

describe('isRetryableGhApiError()', () => {
  it('matches the shared Go net/http transport marker subset', () => {
    expect(isRetryableGhApiError('net/http: timeout awaiting response headers')).toBe(true)
  })

  it('does not match AWS CLI-only endpoint-closed markers', () => {
    expect(
      isRetryableGhApiError(
        'Connection was closed before we received a valid response from endpoint URL',
      ),
    ).toBe(false)
  })

  it('matches GitHub API network transport errors', () => {
    expect(isRetryableGhApiError(makeTransportError('connection reset by peer'))).toBe(true)
    expect(isRetryableGhApiError('dial tcp 140.82.114.6:443: i/o timeout')).toBe(true)
    expect(isRetryableGhApiError({ message: 'unexpected EOF' })).toBe(true)
  })
})
