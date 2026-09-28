import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FeedbackDeliveryResult } from 'vouchington-tooling/agent-blackboard'
import { afterEach, describe, expect, it, vi } from 'vitest'

const appendJournal = vi.fn<typeof import('vouchington-tooling/agent-blackboard').appendJournal>()

const FEEDBACK_FLAGS = [
  '--mode',
  'autonomous',
  '--source-event-id',
  'event-1',
  '--work-outcome',
  'in-progress',
  '--coverage-status',
  'partial',
]

function deliveredJournal(): FeedbackDeliveryResult {
  return {
    status: 'delivered',
    sourceEventId: 'event-1',
    pendingCount: 0,
    receipt: {
      sessionId: 'sess-1',
      sourceEventId: 'event-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      verified: true,
    },
  }
}

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
    appendJournal.mockResolvedValue(deliveredJournal())
    await runAppend(
      [
        '--file',
        noteFile,
        '--session-id',
        'sess-1',
        '--agent',
        'codex',
        ...FEEDBACK_FLAGS,
        ...args,
      ],
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
      [
        '--file',
        noteFile,
        '--session-id',
        'sess-1',
        '--agent',
        'codex',
        '--repository',
        'vouchington/vouchington',
        ...FEEDBACK_FLAGS,
      ],
      HOSTED_ENV,
    ).catch((error: unknown) => error)
    expect(appendJournal).toHaveBeenCalledOnce()
    expect(rejection).toBeInstanceOf(BlackboardJournalError)
    if (!(rejection instanceof BlackboardJournalError)) throw new TypeError('unreachable')
    expect(rejection.repositories).toEqual(['vouchington/vouchington'])
  })
})
