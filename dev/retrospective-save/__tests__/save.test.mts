import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

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
  const dir = await mkdtemp(join(tmpdir(), 'retrospective-save-'))
  testDirs.push(dir)
  return dir
}

async function makeStagedFile(dir: string, content: string | Uint8Array): Promise<string> {
  const path = join(dir, 'staged.md')
  await writeFile(path, content)
  return path
}

const UNREACHABLE_BLACKBOARD_ENV = {
  ...HOSTED_ENV,
  AGENT_BLACKBOARD_URL: 'http://127.0.0.1:1/',
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected runSave to reject')
    },
    (error: unknown) => error,
  )
}

function validRetroMarkdown(
  overrides: { date?: string; issues?: string; prs?: string } = {},
): string {
  const date = overrides.date ?? '2026-07-20'
  const issues = overrides.issues ?? '[]'
  const prs = overrides.prs ?? '[]'
  return `---
date: ${date}
description: sample retro for save.mts tests
issues: ${issues}
prs: ${prs}
worktree: bubbly-knitting-manatee
---

# Retrospective: PR #s - sample

## Verifiable Facts

=== Retrospective Facts ===

## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: none observed
`
}

describe('runSave arg parsing', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('rejects when no --file is given', async () => {
    await expect(runSave(['--session-id', 's1'], {})).rejects.toThrow('save requires --file')
  })

  it('rejects an empty staged file', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, '')
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      'staged retrospective file is empty',
    )
  })

  it('rejects a non-UTF-8 staged file', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, Uint8Array.of(0xc3, 0x28))
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      'not valid UTF-8',
    )
  })

  it('rejects an unknown flag', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown())
    await expect(runSave(['--file', stagedFile, '--wat'], {})).rejects.toThrow(
      'unknown option: --wat',
    )
  })

  it('rejects positional arguments', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown())
    await expect(runSave(['positional', '--file', stagedFile], {})).rejects.toThrow(
      'does not accept positional',
    )
  })
})

describe('runSave content validation', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('rejects a doc that fails the CI-and-Pre-Push-Failures grammar, before any blackboard call', async () => {
    const dir = await makeTempDir()
    const badDoc = validRetroMarkdown().replace('Status: none observed', 'Status: bogus')
    const stagedFile = await makeStagedFile(dir, badDoc)
    const rejection = await captureRejection(
      runSave(['--file', stagedFile, '--session-id', 's1'], {}),
    )
    expect(rejection).toBeInstanceOf(RetrospectiveSaveError)
    expect(() => {
      throw rejection
    }).toThrow(/retrospective doc failed validation/)
  })

  it('rejects a doc whose sections fail validateRetroDoc, before front-matter parsing', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, '# no sections at all\n\nbody\n')
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      /missing "## Verifiable Facts"/,
    )
  })

  it('rejects a doc missing a front-matter block, once sections are otherwise valid', async () => {
    const dir = await makeTempDir()
    const doc = validRetroMarkdown().replace(/^---\n[\s\S]*?\n---\n\n/, '')
    const stagedFile = await makeStagedFile(dir, doc)
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      /missing a front-matter block/,
    )
  })

  it('rejects a doc with an unclosed front-matter block', async () => {
    const dir = await makeTempDir()
    const doc = validRetroMarkdown().replace(/\n---\n\n# Retrospective/, '\n\n# Retrospective')
    const stagedFile = await makeStagedFile(dir, doc)
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      /front-matter block is not closed/,
    )
  })

  it('rejects front matter with a non-array issues field', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown({ issues: '"nope"' }))
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      /"issues" field must be an array/,
    )
  })

  it('rejects front matter with a non-array prs field', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown({ prs: '"nope"' }))
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      /"prs" field must be an array/,
    )
  })

  it('rejects front matter missing a date field', async () => {
    const dir = await makeTempDir()
    const doc = validRetroMarkdown().replace(/^date: .*$/m, '')
    const stagedFile = await makeStagedFile(dir, doc)
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      /missing a non-empty "date" field/,
    )
  })

  it('rejects a malformed front-matter session id', async () => {
    const dir = await makeTempDir()
    const doc = validRetroMarkdown().replace(
      'worktree: bubbly-knitting-manatee',
      'session_id: ../malformed\nworktree: bubbly-knitting-manatee',
    )
    const stagedFile = await makeStagedFile(dir, doc)
    await expect(runSave(['--file', stagedFile, '--session-id', 's1'], {})).rejects.toThrow(
      /"session_id" field must be a valid session id/,
    )
  })
})

describe('runSave hard-fail + replay contract', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('wraps a connection failure in a RetrospectiveSaveError carrying the replay fields', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown())

    const rejection = await captureRejection(
      runSave(['--file', stagedFile, '--session-id', 'sess-1'], {
        ...UNREACHABLE_BLACKBOARD_ENV,
        CLAUDE_CODE_SESSION_ID: 'sess-1',
      }),
    )

    expect(rejection).toBeInstanceOf(RetrospectiveSaveError)
    if (!(rejection instanceof RetrospectiveSaveError)) throw new TypeError('unreachable')
    expect(rejection.stagedFile).toBe(stagedFile)
    expect(rejection.sessionIdArg).toBe('sess-1')
    expect(() => {
      throw rejection
    }).toThrow(/sessions ensure failed/)
  })

  it('carries parent-session-id, agent, and version into the replay fields', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown())

    const rejection = await captureRejection(
      runSave(
        [
          '--file',
          stagedFile,
          '--session-id',
          'sess-1',
          '--parent-session-id',
          'parent-1',
          '--agent',
          'codex',
          '--version',
          '1.2.3',
        ],
        UNREACHABLE_BLACKBOARD_ENV,
      ),
    )

    expect(rejection).toBeInstanceOf(RetrospectiveSaveError)
    if (!(rejection instanceof RetrospectiveSaveError)) throw new TypeError('unreachable')
    expect(rejection.parentSessionId).toBe('parent-1')
    expect(rejection.agent).toBe('codex')
    expect(rejection.version).toBe('1.2.3')
  })

  it('keeps a Grok-compat Codex child paired as Codex', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown())
    const ensureCalls: unknown[] = []
    const appended = entryFixture({ data: { type: 'retrospective' } })
    let getCallCount = 0
    await runSave(
      ['--file', stagedFile],
      { ...HOSTED_ENV, CLAUDECODE: '1', CODEX_THREAD_ID: 'codex-id', GROK_SESSION_ID: 'grok-id' },
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
    )
    expect(ensureCalls).toEqual([
      { id: 'codex-id', parentSessionId: null, agent: 'codex', version: 'unknown' },
    ])
  })
})
