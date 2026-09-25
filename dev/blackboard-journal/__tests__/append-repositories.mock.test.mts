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

async function makeNoteFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'blackboard-journal-repositories-'))
  testDirs.push(dir)
  const path = join(dir, 'note.md')
  await writeFile(path, content)
  return path
}

describe('runAppend repository attribution', () => {
  afterEach(async () => {
    appendJournal.mockReset()
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function appendWith(args: string[]) {
    const noteFile = await makeNoteFile('a note')
    appendJournal.mockResolvedValue('journaled')
    await runAppend(
      ['--file', noteFile, '--session-id', 'sess-1', '--agent', 'codex', ...args],
      HOSTED_ENV,
    )
    return appendJournal.mock.calls[0]?.[0]
  }

  it('tags the entry with this repository by default', async () => {
    const input = await appendWith([])
    expect(input?.repositories).toEqual(['vouchington/vouchington'])
  })

  it('tags the entry with every explicit repository instead of the default', async () => {
    const input = await appendWith([
      '--repository',
      'vouchington/vouchington-clients',
      '--repository',
      'vouchington/vouchington',
    ])
    // appendJournal (vouchington-tooling) normalizes/sorts repositories internally; the caller
    // passes them through in the order given on the command line.
    expect(input?.repositories).toEqual([
      'vouchington/vouchington-clients',
      'vouchington/vouchington',
    ])
  })

  it('carries explicit repositories into the replay fields', async () => {
    const noteFile = await makeNoteFile('a note')
    appendJournal.mockRejectedValue(
      new Error('agent-blackboard request failed: POST /sessions -> 500'),
    )
    const rejection = await runAppend(
      ['--file', noteFile, '--session-id', 'sess-1', '--repository', 'vouchington/vouchington'],
      HOSTED_ENV,
    ).catch((error: unknown) => error)
    expect(rejection).toBeInstanceOf(BlackboardJournalError)
    if (!(rejection instanceof BlackboardJournalError)) throw new TypeError('unreachable')
    expect(rejection.repositories).toEqual(['vouchington/vouchington'])
  })
})
