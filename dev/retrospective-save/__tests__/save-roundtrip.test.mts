import { UNASSESSED_RETROSPECTIVE_SECTIONS } from '../../test-helpers/blackboard/retrospective-sections.mts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  feedbackClientDependencies,
  feedbackStore,
  entriesClientFixture,
  HOSTED_ENV,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { RetrospectiveSaveError, runSave } from '../save.mts'

const directories: string[] = []
const identity = ['--session-id', 'sess-1', '--agent', 'codex']
async function stagedFile(): Promise<{ directory: string; file: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'retrospective-feedback-'))
  directories.push(directory)
  const file = join(directory, 'retro.md')
  await writeFile(
    file,
    `---
date: 2026-07-20
issues: [123, "owner/repo#456"]
prs: []
session_id: sess-1
---

## Verifiable Facts
=== Retrospective Facts ===

## Transcript Facts
=== Transcript Facts ===

## CI Failures
Status: unavailable (not assessed)

${UNASSESSED_RETROSPECTIVE_SECTIONS}
`,
  )
  return { directory, file }
}

describe('retrospective shared writer roundtrip', () => {
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
    )
  })

  it.each([
    'success',
    'failure',
    'cancelled',
    'timed-out',
    'no-change',
    'policy-refusal',
    'unknown',
  ])('persists %s separately from coverage and confirms the exact envelope', async outcome => {
    const { file, directory } = await stagedFile()
    const store = feedbackStore()
    const argv = [
      '--file',
      file,
      '--mode',
      'autonomous',
      '--work-outcome',
      outcome,
      '--coverage-status',
      'partial',
      '--coverage-source',
      'journal',
      '--dropped-count',
      '2',
      ...identity,
    ]
    expect(await runSave(argv, HOSTED_ENV, store.dependencies, directory)).toContain(
      'read-back verified',
    )
    expect(store.records).toHaveLength(1)
    expect(store.records[0]?.data).toMatchObject({
      schemaVersion: 1,
      sourceEventId: 'retrospective-sess-1',
      workOutcome: outcome,
      feedbackCoverage: { status: 'partial', sources: ['journal'], droppedCount: 2 },
      issues: [123, 'owner/repo#456'],
      repositories: ['vouchington/vouchington'],
    })
    await runSave(argv, HOSTED_ENV, store.dependencies, directory)
    expect(store.records).toHaveLength(1)
  })

  it('rejects an unconfirmed autonomous terminal write', async () => {
    const { file, directory } = await stagedFile()
    await expect(
      runSave(
        ['--file', file, '--mode', 'autonomous', '--work-outcome', 'success', ...identity],
        HOSTED_ENV,
        feedbackClientDependencies({ entries: entriesClientFixture() }),
        directory,
      ),
    ).rejects.toThrow(RetrospectiveSaveError)
  })

  it('requires explicit execution mode and terminal outcome', async () => {
    const { file, directory } = await stagedFile()
    const store = feedbackStore()
    await expect(
      runSave(
        ['--file', file, '--work-outcome', 'success', ...identity],
        HOSTED_ENV,
        store.dependencies,
        directory,
      ),
    ).rejects.toThrow('--mode')
    await expect(
      runSave(
        ['--file', file, '--mode', 'autonomous', ...identity],
        HOSTED_ENV,
        store.dependencies,
        directory,
      ),
    ).rejects.toThrow('--work-outcome')
    expect(store.records).toHaveLength(0)
  })
})
