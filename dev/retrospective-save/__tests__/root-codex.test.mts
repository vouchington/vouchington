import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { persistRealSessionId, readPersistedSessionId } from '../../agent-session-id/persist.mts'
import {
  entriesClientFixture,
  entriesIterable,
  entryFixture,
  HOSTED_ENV,
  sessionFixture,
  sessionsClientFixture,
} from '../../blackboard/test-helpers/client-fixtures.mts'
import { RetrospectiveSaveError, runSave } from '../save.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'retrospective-save-root-codex-'))
  testDirs.push(dir)
  return dir
}

async function makeStagedFile(dir: string, sessionId?: string): Promise<string> {
  const path = join(dir, 'staged.md')
  await writeFile(
    path,
    `---
date: 2026-07-20
description: root Codex save test
issues: []
prs: []
${sessionId ? `session_id: ${sessionId}\n` : ''}worktree: bubbly-knitting-manatee
---

# Retrospective: sample

## Verifiable Facts

=== Retrospective Facts ===

## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: none observed
`,
  )
  return path
}

describe('runSave root-Codex identity', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses the injected cwd for persistence', async () => {
    const dir = await makeTempDir()
    const ensureCalls: unknown[] = []
    const appended = entryFixture({ data: { type: 'retrospective' } })
    let getCallCount = 0
    await runSave(
      ['--file', await makeStagedFile(dir), '--root-codex'],
      HOSTED_ENV,
      {
        entries: entriesClientFixture({
          append: async () => appended,
          get: () => entriesIterable(getCallCount++ === 0 ? [] : [appended]),
        }),
        sessions: sessionsClientFixture({
          ensure: async input => {
            ensureCalls.push(input)
            return { status: 'created', session: sessionFixture(input) }
          },
        }),
      },
      dir,
    )

    expect(readPersistedSessionId(dir, 'codex')).toMatch(/^codex-/)
    expect(ensureCalls).toEqual([
      expect.objectContaining({ agent: 'codex', id: readPersistedSessionId(dir, 'codex') }),
    ])
  })

  it('rejects an empty parent session id', async () => {
    const dir = await makeTempDir()
    await expect(
      runSave(
        ['--file', await makeStagedFile(dir), '--root-codex', '--parent-session-id', ''],
        HOSTED_ENV,
        {},
        dir,
      ),
    ).rejects.toThrow('--root-codex cannot be used with --parent-session-id')
  })

  it('rejects staged fallback provenance when a real Codex thread replaces it before save', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, 'codex-fallback-a')
    persistRealSessionId(dir, 'codex', 'codex-fallback-a')
    await expect(
      runSave(
        ['--file', stagedFile, '--root-codex'],
        { ...HOSTED_ENV, CODEX_THREAD_ID: 'codex-real-b' },
        {
          sessions: sessionsClientFixture({
            ensure: async () => {
              throw new Error('must not ensure a mismatched session')
            },
          }),
        },
        dir,
      ),
    ).rejects.toThrow(
      'retrospective doc session_id codex-fallback-a does not match resolved session codex-real-b',
    )
  })

  it('replays a provenance mismatch after rotation with the selected explicit identity', async () => {
    const dir = await makeTempDir()
    const error = await runSave(
      [
        '--file',
        await makeStagedFile(dir, 'codex-old'),
        '--root-codex',
        '--new-root-codex-session',
      ],
      HOSTED_ENV,
      {},
      dir,
    ).catch(error => error)

    expect(error).toBeInstanceOf(RetrospectiveSaveError)
    expect((error as RetrospectiveSaveError).agent).toBe('codex')
    expect((error as RetrospectiveSaveError).sessionIdArg).toMatch(/^codex-/)
    expect((error as RetrospectiveSaveError).sessionIdArg).not.toBe('codex-old')
    expect((error as RetrospectiveSaveError).newRootCodexSession).toBeUndefined()
    expect((error as RetrospectiveSaveError).rootCodex).toBeUndefined()
  })

  it('replays a completed root-session rotation with its selected explicit id', async () => {
    const dir = await makeTempDir()
    const error = await runSave(
      ['--file', await makeStagedFile(dir), '--root-codex', '--new-root-codex-session'],
      HOSTED_ENV,
      {
        sessions: sessionsClientFixture({
          ensure: async () => {
            throw new Error('network failed')
          },
        }),
      },
      dir,
    ).catch(error => error)
    expect(error).toBeInstanceOf(RetrospectiveSaveError)
    expect((error as RetrospectiveSaveError).agent).toBe('codex')
    expect((error as RetrospectiveSaveError).sessionIdArg).toMatch(/^codex-/)
    expect((error as RetrospectiveSaveError).newRootCodexSession).toBeUndefined()
    expect((error as RetrospectiveSaveError).rootCodex).toBeUndefined()
  })
})
