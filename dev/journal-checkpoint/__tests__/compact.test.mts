import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  entriesClientFixture,
  HOSTED_ENV,
  sessionFixture,
  sessionsClientFixture,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { runCompactCheckpoint } from '../compact.mts'

const testDirs: string[] = []

async function makeTranscript(lines: string[], name = 'transcript.jsonl'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'journal-checkpoint-compact-'))
  testDirs.push(dir)
  const path = join(dir, name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8')
  return path
}

type AppendCall = { sessionId: string; data: Record<string, unknown> }

function spyingEntries(calls: AppendCall[]) {
  return entriesClientFixture({
    append: async input => {
      calls.push(input)
      return { sessionId: input.sessionId, createdAt: '2026-07-20T00:00:00.000Z', data: input.data }
    },
  })
}

function spyingSessions(ensureCalls: unknown[]) {
  return sessionsClientFixture({
    ensure: async input => {
      ensureCalls.push(input)
      return { status: 'created', session: sessionFixture(input) }
    },
  })
}

const compactUserLine = JSON.stringify({
  type: 'user',
  message: { role: 'user', content: 'do the thing' },
  uuid: 'u1',
})

describe('runCompactCheckpoint', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('is a no-op when source is not "compact"', async () => {
    const calls: AppendCall[] = []
    await runCompactCheckpoint({ source: 'startup', session_id: 'sess-1' }, HOSTED_ENV, {
      entries: spyingEntries(calls),
    })
    expect(calls).toHaveLength(0)
  })

  it('is a no-op for a blank session id', async () => {
    const calls: AppendCall[] = []
    await runCompactCheckpoint({ source: 'compact', session_id: '' }, HOSTED_ENV, {
      entries: spyingEntries(calls),
    })
    expect(calls).toHaveLength(0)
  })

  it('is a no-op when the transcript file cannot be read', async () => {
    const calls: AppendCall[] = []
    await runCompactCheckpoint(
      {
        source: 'compact',
        session_id: 'sess-1',
        transcript_path: join(tmpdir(), 'does-not-exist-journal-checkpoint.jsonl'),
      },
      HOSTED_ENV,
      { entries: spyingEntries(calls) },
    )
    expect(calls).toHaveLength(0)
  })

  it('computes facts from the transcript and appends a compact-checkpoint journal entry', async () => {
    const transcriptPath = await makeTranscript([
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'do the thing' },
        uuid: 'u1',
      }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [], usage: {} },
        uuid: 'a1',
      }),
    ])

    const calls: AppendCall[] = []
    await runCompactCheckpoint(
      { source: 'compact', session_id: 'sess-1', transcript_path: transcriptPath },
      HOSTED_ENV,
      { entries: spyingEntries(calls), sessions: sessionsClientFixture() },
      'claude',
    )

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call.sessionId).toBe('sess-1')
    expect(call.data.type).toBe('journal')
    expect(call.data.checkpoint).toBe('compaction')
    const markdown = call.data.markdown as string
    expect(markdown).toContain('## Auto-append: post-compaction checkpoint')
    expect(markdown).toContain(`Transcript: ${transcriptPath}`)
    expect(markdown).toContain('User prompts: 1')
  })

  it('streams Claude sibling transcripts and preserves UUID de-duplication', async () => {
    const transcriptPath = await makeTranscript([
      JSON.stringify({ type: 'user', uuid: 'dup', message: { content: 'main' } }),
    ])
    const siblingPath = join(dirname(transcriptPath), 'transcript', 'subagents', 'child.jsonl')
    await mkdir(dirname(siblingPath), { recursive: true })
    await writeFile(
      siblingPath,
      [
        JSON.stringify({ type: 'user', uuid: 'dup', message: { content: 'replayed' } }),
        JSON.stringify({
          type: 'assistant',
          isSidechain: true,
          message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
        }),
      ].join('\n'),
      'utf8',
    )
    const calls: AppendCall[] = []

    await runCompactCheckpoint(
      { source: 'compact', session_id: 'sess-1', transcript_path: transcriptPath },
      HOSTED_ENV,
      { entries: spyingEntries(calls), sessions: sessionsClientFixture() },
      'claude',
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].data.markdown).toContain('User prompts: 1')
    expect(calls[0].data.markdown).toContain('Subagent tool calls: 1')
  })

  it('ensures agent codex from a rollout transcript when CODEX_THREAD_ID is absent', async () => {
    const transcriptPath = await makeTranscript(
      [compactUserLine],
      join('.codex', 'sessions', 'rollout-2026-08-23-sess-1.jsonl'),
    )
    const ensureCalls: unknown[] = []
    const calls: AppendCall[] = []
    await runCompactCheckpoint(
      { source: 'compact', session_id: 'sess-1', transcript_path: transcriptPath },
      HOSTED_ENV,
      { entries: spyingEntries(calls), sessions: spyingSessions(ensureCalls) },
    )

    expect(ensureCalls).toEqual([
      { id: 'sess-1', parentSessionId: null, agent: 'codex', version: 'unknown' },
    ])
    expect(calls).toHaveLength(1)
  })

  it('ensures agent codex from runtime argv when the transcript path is not a rollout', async () => {
    const transcriptPath = await makeTranscript([compactUserLine])
    const ensureCalls: unknown[] = []
    await runCompactCheckpoint(
      { source: 'compact', session_id: 'sess-1', transcript_path: transcriptPath },
      HOSTED_ENV,
      { entries: spyingEntries([]), sessions: spyingSessions(ensureCalls) },
      'codex',
    )

    expect(ensureCalls).toEqual([
      { id: 'sess-1', parentSessionId: null, agent: 'codex', version: 'unknown' },
    ])
  })
})
