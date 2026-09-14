import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  entriesClientFixture,
  entriesIterable,
  entryFixture,
  failingEntriesIterable,
  HOSTED_ENV,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { readPersistedSessionId } from '../../agent-session-id/persist.mts'
import { runEntries } from '../entries.mts'

describe('runEntries', () => {
  it('rejects when no session id is available', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'journal-entries-'))
    try {
      await expect(runEntries([], HOSTED_ENV, undefined, cwd)).rejects.toThrow('no session id')
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
  })

  it('formats journal entries in createdAt order, filtering out other entry types', async () => {
    const entries = [
      entryFixture({
        sessionId: 's1',
        createdAt: '2026-07-20T00:00:02.000Z',
        data: { type: 'journal', markdown: 'second' },
      }),
      entryFixture({
        sessionId: 's1',
        createdAt: '2026-07-20T00:00:01.000Z',
        data: { type: 'journal', markdown: 'first' },
      }),
      entryFixture({
        sessionId: 's1',
        createdAt: '2026-07-20T00:00:03.000Z',
        data: { type: 'retrospective', markdown: 'ignored' },
      }),
    ]

    const result = await runEntries(
      ['--session-id', 's1'],
      HOSTED_ENV,
      entriesClientFixture({ get: () => entriesIterable(entries) }),
    )

    expect(result).toBe(
      '## 2026-07-20T00:00:01.000Z\n\nfirst\n\n## 2026-07-20T00:00:02.000Z\n\nsecond',
    )
  })

  it('reports no entries for a never-created session (404) instead of failing', async () => {
    const entries = entriesClientFixture({
      get: () =>
        failingEntriesIterable('agent-blackboard request failed: GET /sessions/s1/entries -> 404'),
    })

    await expect(runEntries(['--session-id', 's1'], HOSTED_ENV, entries)).resolves.toBe(
      'No journal entries found for session s1.',
    )
  })

  it('propagates a non-404 failure instead of masking it as empty', async () => {
    const entries = entriesClientFixture({
      get: () =>
        failingEntriesIterable('agent-blackboard request failed: GET /sessions/s1/entries -> 500'),
    })

    await expect(runEntries(['--session-id', 's1'], HOSTED_ENV, entries)).rejects.toThrow(/-> 500/)
  })

  it('rejects an unknown flag', async () => {
    await expect(runEntries(['--wat'], {})).rejects.toThrow('unknown option: --wat')
  })

  it('rejects positional arguments', async () => {
    await expect(runEntries(['positional'], {})).rejects.toThrow('does not accept positional')
  })

  it('rotates a root Codex session once, then reuses it for later reads', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'journal-entries-root-codex-'))
    const entries = entriesClientFixture({ get: () => entriesIterable([]) })
    try {
      await runEntries(['--root-codex', '--new-root-codex-session'], HOSTED_ENV, entries, cwd)
      const sessionId = readPersistedSessionId(cwd, 'codex')
      expect(sessionId).toMatch(/^codex-/)

      await runEntries(['--root-codex'], HOSTED_ENV, entries, cwd)
      expect(readPersistedSessionId(cwd, 'codex')).toBe(sessionId)
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
  })
})
