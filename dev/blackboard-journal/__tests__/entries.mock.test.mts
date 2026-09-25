import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const readJournal = vi.fn<typeof import('vouchington-tooling/agent-blackboard').readJournal>()

vi.mock<typeof import('vouchington-tooling/agent-blackboard')>(
  import('vouchington-tooling/agent-blackboard'),
  async importOriginal => {
    const actual = await importOriginal<typeof import('vouchington-tooling/agent-blackboard')>()
    return { ...actual, readJournal }
  },
)

const { readPersistedSessionId } = await import('../../agent-session-id/persist.mts')
const { runEntries } = await import('../entries.mts')

const HOSTED_ENV = {
  AGENT_BLACKBOARD_URL: 'https://example.invalid/',
  AGENT_BLACKBOARD_TOKEN: 'test-token',
}

describe('runEntries', () => {
  afterEach(() => {
    readJournal.mockReset()
  })

  it('rejects when no session id is available', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'journal-entries-'))
    try {
      await expect(runEntries([], HOSTED_ENV, cwd)).rejects.toThrow('no session id')
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
  })

  it('reads journal entries through readJournal', async () => {
    readJournal.mockResolvedValue([
      {
        sessionId: 's1',
        createdAt: '2026-07-20T00:00:00.000Z',
        data: { type: 'journal', markdown: 'note' },
      },
    ])

    const result = await runEntries(['--session-id', 's1'], HOSTED_ENV)

    expect(result).toContain('note')
  })

  it('reports no entries for a never-created session (404) instead of failing', async () => {
    const { AgentBlackboardError } = await import('agent-blackboard')
    readJournal.mockRejectedValue(new AgentBlackboardError('HTTP 404', 404, undefined))

    await expect(runEntries(['--session-id', 's1'], HOSTED_ENV)).resolves.toBe(
      'No journal entries found for session s1.',
    )
  })

  it('propagates a non-404 failure instead of masking it as empty', async () => {
    const { AgentBlackboardError } = await import('agent-blackboard')
    const failure = new AgentBlackboardError('HTTP 500', 500, undefined)
    readJournal.mockRejectedValue(failure)

    await expect(runEntries(['--session-id', 's1'], HOSTED_ENV)).rejects.toBe(failure)
  })

  it('rejects an unknown flag', async () => {
    await expect(runEntries(['--wat'], {})).rejects.toThrow('unknown option: --wat')
  })

  it('rejects positional arguments', async () => {
    await expect(runEntries(['positional'], {})).rejects.toThrow('does not accept positional')
  })

  it('rotates a root Codex session once, then reuses it for later reads', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'journal-entries-root-codex-'))
    readJournal.mockResolvedValue([])
    try {
      await runEntries(['--root-codex', '--new-root-codex-session'], HOSTED_ENV, cwd)
      const sessionId = readPersistedSessionId(cwd, 'codex')
      expect(sessionId).toMatch(/^codex-/)

      await runEntries(['--root-codex'], HOSTED_ENV, cwd)
      expect(readPersistedSessionId(cwd, 'codex')).toBe(sessionId)
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
  })
})
