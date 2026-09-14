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
import { runCheck } from '../check.mts'

describe('runCheck', () => {
  it('does not create the session even when one does not exist yet', async () => {
    const result = await runCheck(
      ['--session-id', 's1'],
      HOSTED_ENV,
      entriesClientFixture({ get: () => entriesIterable([]) }),
    )
    expect(result).toBe('No retrospective saved yet for agent-blackboard session s1.')
  })

  it('reports the existing retrospective, filtering out other entry types', async () => {
    const entries = [
      entryFixture({ createdAt: '2026-07-20T00:00:01.000Z', data: { type: 'journal' } }),
      entryFixture({
        createdAt: '2026-07-20T00:00:02.000Z',
        data: { type: 'retrospective', issues: [9120], prs: [9132] },
      }),
    ]
    const result = await runCheck(
      ['--session-id', 's1'],
      HOSTED_ENV,
      entriesClientFixture({ get: () => entriesIterable(entries) }),
    )
    expect(result).toBe(
      'Retrospective already saved for agent-blackboard session s1 ' +
        '(entry created at 2026-07-20T00:00:02.000Z).\n' +
        'Covered issues: 9120; prs: 9132.',
    )
  })

  it('reports no retrospective yet when only journal entries exist', async () => {
    const entries = [entryFixture({ data: { type: 'journal' } })]
    const result = await runCheck(
      ['--session-id', 's1'],
      HOSTED_ENV,
      entriesClientFixture({ get: () => entriesIterable(entries) }),
    )
    expect(result).toBe('No retrospective saved yet for agent-blackboard session s1.')
  })

  it('reports no retrospective for a never-created session (404) instead of failing', async () => {
    const entries = entriesClientFixture({
      get: () =>
        failingEntriesIterable('agent-blackboard request failed: GET /sessions/s1/entries -> 404'),
    })
    const result = await runCheck(['--session-id', 's1'], HOSTED_ENV, entries)
    expect(result).toBe(
      'No retrospective saved yet for agent-blackboard session s1 (session not created).',
    )
  })

  it('propagates a non-404 failure instead of masking it as no retrospective', async () => {
    const entries = entriesClientFixture({
      get: () =>
        failingEntriesIterable('agent-blackboard request failed: GET /sessions/s1/entries -> 500'),
    })
    await expect(runCheck(['--session-id', 's1'], HOSTED_ENV, entries)).rejects.toThrow(/-> 500/)
  })

  it('rejects when no session id is available', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'retro-check-'))
    try {
      await expect(runCheck([], HOSTED_ENV, entriesClientFixture(), cwd)).rejects.toThrow(
        'no session id',
      )
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
  })

  it('rejects an unknown flag', async () => {
    await expect(runCheck(['--wat'], {})).rejects.toThrow('unknown option: --wat')
  })

  it('rejects positional arguments', async () => {
    await expect(runCheck(['positional'], {})).rejects.toThrow('does not accept positional')
  })

  it('renders missing issues/prs fields as "none" rather than throwing', async () => {
    const entries = [
      entryFixture({ createdAt: '2026-07-20T00:00:02.000Z', data: { type: 'retrospective' } }),
    ]
    const result = await runCheck(
      ['--session-id', 's1'],
      HOSTED_ENV,
      entriesClientFixture({ get: () => entriesIterable(entries) }),
    )
    expect(result).toBe(
      'Retrospective already saved for agent-blackboard session s1 ' +
        '(entry created at 2026-07-20T00:00:02.000Z).\n' +
        'Covered issues: none; prs: none.',
    )
  })

  it('rotates a root Codex session once, then reuses it for later checks', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'retro-check-root-codex-'))
    const entries = entriesClientFixture({ get: () => entriesIterable([]) })
    try {
      await runCheck(['--root-codex', '--new-root-codex-session'], HOSTED_ENV, entries, cwd)
      const sessionId = readPersistedSessionId(cwd, 'codex')
      expect(sessionId).toMatch(/^codex-/)

      await runCheck(['--root-codex'], HOSTED_ENV, entries, cwd)
      expect(readPersistedSessionId(cwd, 'codex')).toBe(sessionId)
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
  })
})
