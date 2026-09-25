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

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'blackboard-journal-append-'))
  testDirs.push(dir)
  return dir
}

async function makeNoteFile(dir: string, content: string): Promise<string> {
  const path = join(dir, 'note.md')
  await writeFile(path, content)
  return path
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected runAppend to reject')
    },
    (error: unknown) => error,
  )
}

const HOSTED_ENV = {
  AGENT_BLACKBOARD_URL: 'https://example.invalid/',
  AGENT_BLACKBOARD_TOKEN: 'test-token',
}

describe('runAppend arg parsing', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('rejects when no --file is given', async () => {
    await expect(runAppend(['--session-id', 's1'], {})).rejects.toThrow('append requires --file')
  })

  it('rejects an unknown flag', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'note')
    await expect(runAppend(['--file', noteFile, '--wat'], {})).rejects.toThrow(
      'unknown option: --wat',
    )
  })

  it('rejects positional note arguments', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'note')
    await expect(runAppend(['positional', '--file', noteFile], {})).rejects.toThrow(
      'does not accept positional',
    )
  })
})

describe('runAppend hard-fail + replay contract', () => {
  afterEach(async () => {
    appendJournal.mockReset()
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('wraps a connection failure in a BlackboardJournalError carrying the replay fields', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'a note')
    appendJournal.mockRejectedValue(
      new Error('agent-blackboard request failed: POST /sessions -> 500'),
    )

    const rejection = await captureRejection(
      runAppend(['--file', noteFile, '--session-id', 'sess-1'], {
        ...HOSTED_ENV,
        CLAUDE_CODE_SESSION_ID: 'sess-1',
      }),
    )

    expect(rejection).toBeInstanceOf(BlackboardJournalError)
    if (!(rejection instanceof BlackboardJournalError)) throw new TypeError('unreachable')
    expect(rejection.noteFile).toBe(noteFile)
    expect(rejection.sessionIdArg).toBe('sess-1')
    expect(() => {
      throw rejection
    }).toThrow(/POST \/sessions -> 500/)
  })

  it('omits sessionIdArg from the replay fields when the session id came from env', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'a note')
    appendJournal.mockRejectedValue(
      new Error('agent-blackboard request failed: POST /sessions -> 500'),
    )

    const rejection = await captureRejection(
      runAppend(['--file', noteFile], { ...HOSTED_ENV, CLAUDE_CODE_SESSION_ID: 'env-sess' }),
    )

    expect(rejection).toBeInstanceOf(BlackboardJournalError)
    if (!(rejection instanceof BlackboardJournalError)) throw new TypeError('unreachable')
    expect(rejection.noteFile).toBe(noteFile)
    expect(rejection.sessionIdArg).toBeUndefined()
  })

  it('carries parent-session-id, agent, version, and timestamp into the replay fields', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'a note')
    appendJournal.mockRejectedValue(
      new Error('agent-blackboard request failed: POST /sessions -> 500'),
    )

    const rejection = await captureRejection(
      runAppend(
        [
          '--file',
          noteFile,
          '--session-id',
          'sess-1',
          '--parent-session-id',
          'parent-1',
          '--agent',
          'codex',
          '--version',
          '1.2.3',
          '--timestamp',
          '2026-07-22T00:00:00.000Z',
        ],
        HOSTED_ENV,
      ),
    )

    expect(rejection).toBeInstanceOf(BlackboardJournalError)
    if (!(rejection instanceof BlackboardJournalError)) throw new TypeError('unreachable')
    expect(rejection.parentSessionId).toBe('parent-1')
    expect(rejection.agent).toBe('codex')
    expect(rejection.version).toBe('1.2.3')
    expect(rejection.timestamp).toBe('2026-07-22T00:00:00.000Z')
  })
})

describe('runAppend Codex identity', () => {
  afterEach(async () => {
    appendJournal.mockReset()
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('ensures agent codex for --session-id when CODEX_THREAD_ID is set', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'a note')
    appendJournal.mockResolvedValue('journaled')
    await runAppend(['--file', noteFile, '--session-id', 'thread-1'], {
      ...HOSTED_ENV,
      CODEX_THREAD_ID: 'thread-1',
    })
    expect(appendJournal).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'thread-1', agent: 'codex', version: 'unknown' }),
    )
  })

  it('keeps a direct Cursor and Grok session paired as Grok', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'a note')
    appendJournal.mockResolvedValue('journaled')
    await runAppend(
      ['--file', noteFile],
      { ...HOSTED_ENV, CURSOR_SESSION_ID: 'cursor-id', GROK_SESSION_ID: 'grok-id' },
      dir,
    )
    expect(appendJournal).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'grok-id', agent: 'grok' }),
    )
  })

  it('hard-fails when no agent identity can be resolved', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'a note')
    const rejection = await captureRejection(
      runAppend(['--file', noteFile, '--session-id', 'sess-1'], HOSTED_ENV, dir),
    )
    expect(rejection).toBeInstanceOf(BlackboardJournalError)
    expect(() => {
      throw rejection
    }).toThrow(/no blackboard agent identity/)
    expect(appendJournal).not.toHaveBeenCalled()
  })

  it('hard-fails when the underlying appendJournal call rejects with a session mismatch', async () => {
    const dir = await makeTempDir()
    const noteFile = await makeNoteFile(dir, 'a note')
    appendJournal.mockRejectedValue(
      new Error(
        'session thread-1 exists with different fields: agent: expected "codex", got "claude-code"',
      ),
    )
    const rejection = await captureRejection(
      runAppend(['--file', noteFile, '--session-id', 'thread-1'], {
        ...HOSTED_ENV,
        CODEX_THREAD_ID: 'thread-1',
      }),
    )
    expect(appendJournal).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'thread-1', agent: 'codex' }),
    )
    expect(rejection).toBeInstanceOf(BlackboardJournalError)
    expect(() => {
      throw rejection
    }).toThrow(/agent: expected "codex", got "claude-code"/)
  })
})
