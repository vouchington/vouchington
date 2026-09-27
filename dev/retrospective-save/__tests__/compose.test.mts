import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RetrospectiveCompositionInput } from 'vouchington-tooling/agent-blackboard'
import { recordFriction } from 'vouchington-tooling/session-friction'

import {
  entriesClientFixture,
  entriesIterable,
  entryFixture,
  feedbackStore,
  HOSTED_ENV,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { frictionLogDirectory } from '../../session-friction/config.mts'
import { runCompose } from '../compose.mts'
import { runSave } from '../save.mts'

const CI_OBSERVATION = [
  '- `recurring` — `GitHub Actions` — vitest suite timed out',
  '  - Evidence: CI run #1234 failed twice with the same timeout',
  '  - Root diagnostic: shared runner oversubscription',
  '  - Disposition: retried and passed; tracked in issue #9000',
].join('\n')

function input(): RetrospectiveCompositionInput {
  return {
    sessionId: 'thread-1',
    date: '2026-09-27',
    issues: [],
    prs: [],
    description: 'bounded session',
    repositories: ['vouchington/vouchington'],
    workOutcome: 'no-change',
    feedbackCoverage: { status: 'partial', sources: ['journal', 'friction'], droppedCount: 0 },
    narrative: '# Retrospective\nNo substantive work.',
    facts: { status: 'unavailable', reason: 'repository evidence unavailable' },
    transcript: { status: 'unavailable', reason: 'runtime did not capture transcript' },
    tools: { status: 'none-observed', reason: 'no tool activity observed in journal' },
    architecture: { status: 'not-assessed', reason: 'no architecture work' },
  }
}

describe('shared retrospective composition', () => {
  it('generates required markers without inventing unavailable evidence or architectural findings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
    try {
      const file = join(directory, 'input.json')
      await writeFile(
        file,
        JSON.stringify({
          ...input(),
          feedbackCoverage: { status: 'unavailable', sources: [], droppedCount: 0 },
        }),
      )
      const markdown = await runCompose(['--input', file], {})
      expect(markdown).toContain('=== Retrospective Facts ===')
      expect(markdown).toContain('=== Transcript Facts ===')
      expect(markdown).toContain('## CI Failures')
      expect(markdown).toContain('Work outcome: no-change')
      expect(markdown).toContain('Status: not assessed (no architecture work)')
      expect(markdown).toContain('Status: unavailable (runtime did not capture transcript)')
      expect(markdown).toContain('## CI Failures\nStatus: unavailable')
      expect(markdown).toContain('## Sandbox & Permission Audit\nStatus: unavailable')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('collects hosted CI and local sandbox observations through compose and save', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
    try {
      const env = { ...HOSTED_ENV, TMPDIR: directory }
      const file = join(directory, 'input.json')
      const staged = join(directory, 'retrospective.md')
      await writeFile(file, JSON.stringify(input()))
      recordFriction(
        'thread-1',
        { type: 'permission-request', command: 'git push' },
        { directory: frictionLogDirectory(env) },
      )
      let journalReads = 0
      const entries = entriesClientFixture({
        get: ({ sessionId }) => {
          journalReads++
          expect(sessionId).toBe('thread-1')
          return entriesIterable([
            entryFixture({ data: { type: 'journal', markdown: CI_OBSERVATION } }),
          ])
        },
      })
      const markdown = await runCompose(['--input', file], env, entries)
      expect(journalReads).toBe(1)
      expect(markdown).toContain('shared runner oversubscription')
      expect(markdown).toContain('git push')
      await writeFile(staged, markdown)
      const store = feedbackStore()
      await runSave(
        ['--mode', 'autonomous', '--file', staged, '--session-id', 'thread-1', '--agent', 'codex'],
        env,
        store.dependencies,
        directory,
      )
      expect(store.records[0]?.data).toMatchObject({
        workOutcome: 'no-change',
        feedbackCoverage: input().feedbackCoverage,
        markdown,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('preserves canonical multi-repository attribution and rejects conflicting save flags', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
    try {
      const file = join(directory, 'input.json')
      const staged = join(directory, 'retrospective.md')
      await writeFile(
        file,
        JSON.stringify({
          ...input(),
          repositories: ['Vouchington/Vouchington', 'vouchington/vouchington-tooling'],
        }),
      )
      const markdown = await runCompose(['--input', file], { TMPDIR: directory })
      expect(markdown).toContain(
        'repositories: ["vouchington/vouchington","vouchington/vouchington-tooling"]',
      )
      await writeFile(staged, markdown)
      const store = feedbackStore()
      const saveArgs = [
        '--mode',
        'autonomous',
        '--file',
        staged,
        '--session-id',
        'thread-1',
        '--agent',
        'codex',
      ]
      await expect(
        runSave(
          [...saveArgs, '--repository', 'vouchington/other'],
          HOSTED_ENV,
          store.dependencies,
          directory,
        ),
      ).rejects.toThrow(/--repository conflicts/)
      expect(store.records).toHaveLength(0)
      await runSave(
        [
          ...saveArgs,
          '--repository',
          'VOUCHINGTON/VOUCHINGTON-TOOLING',
          '--repository',
          'vouchington/vouchington',
        ],
        HOSTED_ENV,
        store.dependencies,
        directory,
      )
      expect(store.records[0]?.data.repositories).toEqual([
        'vouchington/vouchington',
        'vouchington/vouchington-tooling',
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    { friction: { directory: '/tmp/forged', journalLoader: 'fake' } },
    { journalLoader: 'fake' },
    { facts: { ...input().facts, execute: 'fake' } },
    { facts: { repo: 'vouchington/vouchington', execute: 'fake' } },
    { facts: { ...input().facts, onWarning: 'fake' } },
    { facts: { ...input().facts, raw: true } },
    { transcript: { ...input().transcript, env: { AGENT_BLACKBOARD_TOKEN: 'fake' } } },
    { transcript: { jsonlPath: '/tmp/forged.jsonl', env: {} } },
    { transcript: { jsonlPath: '/tmp/foreign.jsonl' } },
    { transcript: { sessionId: 'thread-1', jsonlPath: '/tmp/foreign.jsonl' } },
  ])('rejects executable or caller-controlled collector options from JSON', async override => {
    const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
    try {
      const file = join(directory, 'input.json')
      await writeFile(file, JSON.stringify({ ...input(), ...override }))
      await expect(runCompose(['--input', file])).rejects.toThrow(/collector options/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([null, [], { ...input(), facts: null }, { ...input(), transcript: [] }])(
    'rejects a malformed serializable composition input',
    async payload => {
      const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
      try {
        const file = join(directory, 'input.json')
        await writeFile(file, JSON.stringify(payload))
        await expect(runCompose(['--input', file])).rejects.toThrow(/composition/)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it('rejects a transcript collector bound to another session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
    try {
      const file = join(directory, 'input.json')
      await writeFile(
        file,
        JSON.stringify({ ...input(), transcript: { sessionId: 'other-session' } }),
      )
      await expect(runCompose(['--input', file])).rejects.toThrow(/sessionId must match/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not read an ambient session transcript for a different composition identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
    const ownSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const ambientSession = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    try {
      const file = join(directory, 'input.json')
      await writeFile(
        join(directory, `rollout-2026-09-27-${ambientSession}.jsonl`),
        `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'FOREIGN_TRANSCRIPT_MARKER' } })}\n`,
      )
      await writeFile(
        file,
        JSON.stringify({
          ...input(),
          sessionId: ownSession,
          transcript: { codexSessionsDir: directory },
        }),
      )
      const markdown = await runCompose(['--input', file], {
        TMPDIR: directory,
        CODEX_THREAD_ID: ambientSession,
      })
      expect(markdown).toContain(`no transcript found for session ${ownSession}`)
      expect(markdown).not.toContain('FOREIGN_TRANSCRIPT_MARKER')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('shows unavailable journal coverage and rejects an understated dropped count', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
    try {
      const env = { TMPDIR: directory }
      const file = join(directory, 'input.json')
      const logDirectory = frictionLogDirectory(env)
      recordFriction(
        'thread-1',
        { type: 'permission-request', command: 'git push' },
        { directory: logDirectory, maxEvents: 1 },
      )
      recordFriction(
        'thread-1',
        { type: 'permission-request', command: 'git fetch' },
        { directory: logDirectory, maxEvents: 1 },
      )
      await writeFile(file, JSON.stringify(input()))
      await expect(runCompose(['--input', file], env)).rejects.toThrow(/dropped count/)
      await writeFile(
        file,
        JSON.stringify({
          ...input(),
          feedbackCoverage: { ...input().feedbackCoverage, droppedCount: 1 },
        }),
      )
      const markdown = await runCompose(['--input', file], env)
      expect(markdown).toContain('Status: unavailable')
      expect(markdown).toContain('Dropped records: 1')
      expect(markdown).toContain('Status: partial')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
