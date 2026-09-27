import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  composeRetrospective,
  type RetrospectiveCompositionInput,
} from 'vouchington-tooling/agent-blackboard'
import { recordFriction } from 'vouchington-tooling/session-friction'

import { feedbackStore, HOSTED_ENV } from '../../test-helpers/blackboard/client-fixtures.mts'
import { runSave } from '../save.mts'

const directories: string[] = []

function composition(): RetrospectiveCompositionInput {
  return {
    sessionId: 'sess-1',
    date: '2026-09-27',
    issues: [],
    prs: [],
    description: 'Generated metadata roundtrip',
    repositories: ['vouchington/vouchington'],
    workOutcome: 'no-change',
    feedbackCoverage: { status: 'partial', sources: ['journal', 'friction'], droppedCount: 3 },
    narrative: '# Retrospective\nThe task made no changes.',
    facts: { status: 'unavailable', reason: 'repository evidence unavailable' },
    transcript: { status: 'unavailable', reason: 'transcript not captured' },
    tools: { status: 'none-observed', reason: 'reviewed available journal observations' },
    architecture: { status: 'not-assessed', reason: 'no architecture work' },
  }
}

async function staged(markdown: string) {
  const directory = await mkdtemp(join(tmpdir(), 'retrospective-metadata-'))
  directories.push(directory)
  const file = join(directory, 'retro.md')
  await writeFile(file, markdown)
  return { directory, file }
}

const identity = ['--session-id', 'sess-1', '--agent', 'codex']

describe('generated retrospective metadata handoff', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
  })

  it('preserves generated outcome, sources and drops without repeating metadata flags', async () => {
    const input = composition()
    const markdown = await composeRetrospective(input)
    const { file, directory } = await staged(markdown)
    const store = feedbackStore()
    const argv = ['--file', file, '--mode', 'autonomous', ...identity]
    await runSave(argv, HOSTED_ENV, store.dependencies, directory)
    expect(store.records[0]?.data).toMatchObject({
      workOutcome: input.workOutcome,
      feedbackCoverage: input.feedbackCoverage,
      markdown,
    })
    await runSave(argv, HOSTED_ENV, store.dependencies, directory)
    expect(store.records).toHaveLength(1)
  })

  it('preserves complete generated coverage from available collectors', async () => {
    const { directory } = await staged('collector workspace')
    const transcript = join(directory, 'transcript.jsonl')
    await writeFile(
      transcript,
      `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message' } })}\n`,
    )
    recordFriction('sess-1', { type: 'tool-result', command: 'echo clean' }, { directory })
    const input: RetrospectiveCompositionInput = {
      ...composition(),
      facts: {
        repo: 'vouchington/vouchington',
        pr: '1',
        execute: async () => ({
          ok: true,
          stderr: '',
          stdout: JSON.stringify({
            number: 1,
            state: 'OPEN',
            headRefName: 'feature',
            baseRefName: 'main',
            changedFiles: 0,
            files: [],
            commits: [],
          }),
        }),
      },
      transcript: { jsonlPath: transcript },
      friction: { directory, journalLoader: () => ({ status: 'not-found' }) },
      architecture: { status: 'none-observed', reason: 'reviewed the unchanged service boundary' },
      feedbackCoverage: {
        status: 'complete',
        sources: ['repository', 'transcript', 'journal', 'friction'],
        droppedCount: 0,
      },
    }
    const { file, directory: stagedDirectory } = await staged(await composeRetrospective(input))
    const store = feedbackStore()
    await runSave(
      ['--file', file, '--mode', 'autonomous', ...identity],
      HOSTED_ENV,
      store.dependencies,
      stagedDirectory,
    )
    expect(store.records[0]?.data).toMatchObject({
      workOutcome: 'no-change',
      feedbackCoverage: input.feedbackCoverage,
    })
  })

  it.each([
    ['--work-outcome', 'success'],
    ['--coverage-status', 'complete'],
    ['--coverage-source', 'other-source'],
    ['--dropped-count', '0'],
  ])('rejects conflicting explicit %s before delivery', async (flag, value) => {
    const { file, directory } = await staged(await composeRetrospective(composition()))
    const store = feedbackStore()
    await expect(
      runSave(
        ['--file', file, '--mode', 'autonomous', flag, value, ...identity],
        HOSTED_ENV,
        store.dependencies,
        directory,
      ),
    ).rejects.toThrow(/conflict.*staged feedback metadata/)
    expect(store.records).toHaveLength(0)
  })

  it('accepts matching explicit flags and still requires trusted mode selection', async () => {
    const { file, directory } = await staged(await composeRetrospective(composition()))
    const store = feedbackStore()
    const flags = [
      '--file',
      file,
      '--work-outcome',
      'no-change',
      '--coverage-status',
      'partial',
      '--coverage-source',
      'journal',
      '--coverage-source',
      'friction',
      '--dropped-count',
      '3',
      ...identity,
    ]
    await expect(runSave(flags, HOSTED_ENV, store.dependencies, directory)).rejects.toThrow(
      '--mode',
    )
    await runSave([...flags, '--mode', 'autonomous'], HOSTED_ENV, store.dependencies, directory)
    expect(store.records).toHaveLength(1)
  })

  it.each([
    ['work_outcome: "no-change"\n', /must provide both/],
    [
      'work_outcome: "in-progress"\nfeedback_coverage: {status: partial, sources: [], droppedCount: 0}\n',
      /terminal/,
    ],
    [
      'work_outcome: "no-change"\nfeedback_coverage: {status: invalid, sources: [], droppedCount: 0}\n',
      /feedbackCoverage/,
    ],
    [
      'work_outcome: "no-change"\nfeedback_coverage: {status: partial, sources: [], droppedCount: 0, raw: hidden}\n',
      /unsupported feedbackCoverage/,
    ],
  ])('rejects malformed generated metadata %# before delivery', async (metadata, error) => {
    const markdown = (await composeRetrospective(composition()))
      .replace(/^work_outcome:.*\n/m, '')
      .replace(/^feedback_coverage:.*\n/m, '')
      .replace(/^---\n/, `---\n${metadata}`)
    const { file, directory } = await staged(markdown)
    const store = feedbackStore()
    await expect(
      runSave(
        ['--file', file, '--mode', 'autonomous', ...identity],
        HOSTED_ENV,
        store.dependencies,
        directory,
      ),
    ).rejects.toThrow(error)
    expect(store.records).toHaveLength(0)
  })
})
