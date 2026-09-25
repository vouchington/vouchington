import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const appendJournal = vi.fn<typeof import('vouchington-tooling/agent-blackboard').appendJournal>()

vi.mock<typeof import('vouchington-tooling/agent-blackboard')>(
  import('vouchington-tooling/agent-blackboard'),
  () => ({ appendJournal }),
)

const { BlackboardJournalError, runAppend } = await import('../append.mts')

const HOSTED_ENV = {
  AGENT_BLACKBOARD_URL: 'https://example.invalid/',
  AGENT_BLACKBOARD_TOKEN: 'test-token',
}

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
    appendJournal.mockReset()
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
    appendJournal.mockResolvedValue('journaled')

    await runAppend(['--file', await makeNoteFile(dir), '--root-codex'], HOSTED_ENV, dir)
    await runAppend(['--file', await makeNoteFile(dir), '--root-codex'], HOSTED_ENV, dir)

    expect(appendJournal).toHaveBeenCalledTimes(2)
    const [[first], [second]] = appendJournal.mock.calls
    expect(first).toEqual(
      expect.objectContaining({ agent: 'codex', sessionId: expect.stringMatching(/^codex-/) }),
    )
    expect(second).toEqual(expect.objectContaining({ agent: 'codex', sessionId: first?.sessionId }))
  })

  it('replays a completed root-session rotation with its selected explicit id', async () => {
    const dir = await makeTempDir()
    appendJournal.mockRejectedValue(new Error('network failed'))
    const error = await runAppend(
      ['--file', await makeNoteFile(dir), '--root-codex', '--new-root-codex-session'],
      HOSTED_ENV,
      dir,
    ).catch(error => error)
    if (!(error instanceof BlackboardJournalError)) throw new TypeError('unreachable')
    expect(error.agent).toBe('codex')
    expect(error.sessionIdArg).toMatch(/^codex-/)
    expect(error.newRootCodexSession).toBeUndefined()
    expect(error.rootCodex).toBeUndefined()
  })
})
