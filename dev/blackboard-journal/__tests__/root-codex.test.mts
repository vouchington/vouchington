import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  entriesClientFixture,
  HOSTED_ENV,
  sessionFixture,
  sessionsClientFixture,
} from '../../blackboard/test-helpers/client-fixtures.mts'
import { BlackboardJournalError, runAppend } from '../append.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'blackboard-journal-root-codex-'))
  testDirs.push(dir)
  return dir
}

async function makeNoteFile(dir: string): Promise<string> {
  const path = join(dir, 'note.md')
  await writeFile(path, 'a note')
  return path
}

describe('runAppend root-Codex identity', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it.each(['parent-1', ''])('rejects %j as a parent session id', async parentSessionId => {
    const dir = await makeTempDir()
    await expect(
      runAppend(
        ['--file', await makeNoteFile(dir), '--root-codex', '--parent-session-id', parentSessionId],
        HOSTED_ENV,
      ),
    ).rejects.toThrow('--root-codex cannot be used with --parent-session-id')
  })

  it('creates and reuses a persisted id', async () => {
    const dir = await makeTempDir()
    const ensureCalls: Array<{ id: string; agent: string }> = []
    const clients = {
      entries: entriesClientFixture(),
      sessions: sessionsClientFixture({
        ensure: async input => {
          ensureCalls.push({ agent: input.agent, id: input.id })
          return { status: 'created', session: sessionFixture(input) }
        },
      }),
    }

    await runAppend(['--file', await makeNoteFile(dir), '--root-codex'], HOSTED_ENV, clients, dir)
    await runAppend(['--file', await makeNoteFile(dir), '--root-codex'], HOSTED_ENV, clients, dir)

    expect(ensureCalls).toHaveLength(2)
    expect(ensureCalls[0]).toEqual({ agent: 'codex', id: expect.stringMatching(/^codex-/) })
    expect(ensureCalls[1]).toEqual(ensureCalls[0])
  })

  it('replays a completed root-session rotation with its selected explicit id', async () => {
    const dir = await makeTempDir()
    const error = await runAppend(
      ['--file', await makeNoteFile(dir), '--root-codex', '--new-root-codex-session'],
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
    expect(error).toBeInstanceOf(BlackboardJournalError)
    expect((error as BlackboardJournalError).agent).toBe('codex')
    expect((error as BlackboardJournalError).sessionIdArg).toMatch(/^codex-/)
    expect((error as BlackboardJournalError).newRootCodexSession).toBeUndefined()
    expect((error as BlackboardJournalError).rootCodex).toBeUndefined()
  })
})
