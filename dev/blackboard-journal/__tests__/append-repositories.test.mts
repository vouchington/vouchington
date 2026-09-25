import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  HOSTED_ENV,
  entriesClientFixture,
  entryFixture,
  sessionFixture,
  sessionsClientFixture,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { BlackboardJournalError, runAppend } from '../append.mts'

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
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function appendWith(args: string[]) {
    const noteFile = await makeNoteFile('a note')
    const patches: unknown[] = []
    const appends: unknown[] = []
    await runAppend(
      ['--file', noteFile, '--session-id', 'sess-1', '--agent', 'codex', ...args],
      HOSTED_ENV,
      {
        entries: entriesClientFixture({
          append: async input => {
            appends.push(input)
            return entryFixture(input)
          },
        }),
        sessions: sessionsClientFixture({
          patch: async input => {
            patches.push(input)
            return sessionFixture({ id: 'sess-1', agent: 'codex', version: 'unknown' })
          },
        }),
      },
    )
    return { appends, patches }
  }

  it('tags the entry and session with this repository by default', async () => {
    const { appends, patches } = await appendWith([])
    expect(patches).toEqual([
      { sessionId: 'sess-1', data: { repositories: ['vouchington/vouchington'] } },
    ])
    expect(appends).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ repositories: ['vouchington/vouchington'] }),
      }),
    ])
  })

  it('tags the entry with every explicit repository instead of the default', async () => {
    const { appends } = await appendWith([
      '--repository',
      'vouchington/vouchington-clients',
      '--repository',
      'vouchington/vouchington',
    ])
    expect(appends).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          repositories: ['vouchington/vouchington', 'vouchington/vouchington-clients'],
        }),
      }),
    ])
  })

  it('carries explicit repositories into the replay fields', async () => {
    const noteFile = await makeNoteFile('a note')
    const rejection = await runAppend(
      ['--file', noteFile, '--session-id', 'sess-1', '--repository', 'vouchington/vouchington'],
      HOSTED_ENV,
      {
        sessions: sessionsClientFixture({
          ensure: async () => {
            throw new Error('agent-blackboard request failed: POST /sessions -> 500')
          },
        }),
      },
    ).catch((error: unknown) => error)
    expect(rejection).toBeInstanceOf(BlackboardJournalError)
    if (!(rejection instanceof BlackboardJournalError)) throw new TypeError('unreachable')
    expect(rejection.repositories).toEqual(['vouchington/vouchington'])
  })
})
