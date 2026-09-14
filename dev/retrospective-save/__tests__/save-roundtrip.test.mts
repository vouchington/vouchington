import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  entriesClientFixture,
  entriesIterable,
  entryFixture,
  HOSTED_ENV,
  sessionsClientFixture,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { RetrospectiveSaveError, runSave } from '../save.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'retrospective-save-roundtrip-'))
  testDirs.push(dir)
  return dir
}

async function makeStagedFile(dir: string, content: string | Uint8Array): Promise<string> {
  const path = join(dir, 'staged.md')
  await writeFile(path, content)
  return path
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected runSave to reject')
    },
    (error: unknown) => error,
  )
}

function validRetroMarkdown(): string {
  return `---
date: 2026-07-20
description: sample retro for save.mts tests
issues: []
prs: []
session_id: sess-1
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

describe('runSave skip-if-present + append + read-back', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('skips the append when a retrospective entry already exists for this session', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown())
    const existing = entryFixture({
      createdAt: '2026-07-19T00:00:00.000Z',
      data: { type: 'retrospective' },
    })
    const entries = entriesClientFixture({
      append: async () => {
        throw new Error('append should not have been called')
      },
      get: () => entriesIterable([existing]),
    })

    const result = await runSave(
      ['--file', stagedFile, '--session-id', 'sess-1'],
      { ...HOSTED_ENV, CLAUDE_CODE_SESSION_ID: 'sess-1' },
      {
        sessions: sessionsClientFixture(),
        entries,
      },
    )

    expect(result).toBe(
      'Retrospective already saved for agent-blackboard session sess-1 ' +
        '(entry created at 2026-07-19T00:00:00.000Z); skipping duplicate append.',
    )
  })

  it('appends and confirms via read-back when no retrospective entry exists yet', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown())
    const appended = entryFixture({
      createdAt: '2026-07-20T00:00:00.000Z',
      data: { type: 'retrospective' },
    })
    let getCallCount = 0
    const entries = entriesClientFixture({
      append: async () => appended,
      get: () => entriesIterable(getCallCount++ === 0 ? [] : [appended]),
    })

    const result = await runSave(
      ['--file', stagedFile, '--session-id', 'sess-1'],
      { ...HOSTED_ENV, CLAUDE_CODE_SESSION_ID: 'sess-1' },
      {
        sessions: sessionsClientFixture(),
        entries,
      },
    )

    expect(result).toBe(
      'Saved retrospective to agent-blackboard session sess-1 (entry created at 2026-07-20T00:00:00.000Z).',
    )
  })

  it('hard-fails when the appended entry is not found on read-back', async () => {
    const dir = await makeTempDir()
    const stagedFile = await makeStagedFile(dir, validRetroMarkdown())
    const appended = entryFixture({
      createdAt: '2026-07-20T00:00:00.000Z',
      data: { type: 'retrospective' },
    })
    const entries = entriesClientFixture({
      append: async () => appended,
      get: () => entriesIterable([]),
    })

    const rejection = await captureRejection(
      runSave(
        ['--file', stagedFile, '--session-id', 'sess-1'],
        { ...HOSTED_ENV, CLAUDE_CODE_SESSION_ID: 'sess-1' },
        {
          sessions: sessionsClientFixture(),
          entries,
        },
      ),
    )

    expect(rejection).toBeInstanceOf(RetrospectiveSaveError)
    expect(() => {
      throw rejection
    }).toThrow(/failed read-back verification/)
  })
})
