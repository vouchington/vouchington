import { describe, expect, it, vi } from 'vitest'

import { run } from '../../retrospective-transcript-facts.mts'

const { runRetrospectiveTranscript } = vi.hoisted(() => ({
  runRetrospectiveTranscript:
    vi.fn<
      typeof import('vouchington-tooling/retrospective-transcript').runRetrospectiveTranscript
    >(),
}))

vi.mock<typeof import('vouchington-tooling/retrospective-transcript')>(
  import('vouchington-tooling/retrospective-transcript'),
  async importOriginal => ({
    ...(await importOriginal()),
    runRetrospectiveTranscript,
  }),
)

describe('run', () => {
  it('parses supported local flags and delegates the normalized options', async () => {
    runRetrospectiveTranscript.mockResolvedValue('facts')

    await expect(
      run(
        [
          '--session-id',
          'session',
          '--projects-dir',
          '/projects',
          '--codex-sessions-dir',
          '/codex',
          '--jsonl',
          '/session.jsonl',
        ],
        { TEST_ENV: 'value' },
      ),
    ).resolves.toBe('facts')

    expect(runRetrospectiveTranscript).toHaveBeenCalledWith({
      sessionId: 'session',
      projectsDir: '/projects',
      codexSessionsDir: '/codex',
      jsonlPath: '/session.jsonl',
      env: { TEST_ENV: 'value' },
    })
  })

  it('rejects missing and option-looking --codex-sessions-dir values', async () => {
    await expect(run(['--codex-sessions-dir'])).rejects.toThrow(
      "Option '--codex-sessions-dir <value>' argument missing",
    )
    await expect(run(['--codex-sessions-dir', ''])).rejects.toThrow(
      '--codex-sessions-dir requires a value',
    )
    await expect(run(['--codex-sessions-dir', '--jsonl', '/tmp/child.jsonl'])).rejects.toThrow(
      "Option '--codex-sessions-dir' argument is ambiguous",
    )
  })

  it('rejects an unrecognized flag', async () => {
    await expect(run(['--jsno'])).rejects.toThrow("Unknown option '--jsno'")
  })
})
