import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  entriesClientFixture,
  HOSTED_ENV,
  sessionFixture,
  sessionsClientFixture,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { appendCheckpoint } from '../append.mts'

describe('appendCheckpoint identity resolution', () => {
  it('uses the runtime agent when CODEX_THREAD_ID is absent', async () => {
    const ensureCalls: unknown[] = []
    const cwd = await mkdtemp(join(tmpdir(), 'journal-checkpoint-'))
    try {
      await appendCheckpoint({
        checkpoint: 'compaction',
        cwd,
        entries: entriesClientFixture(),
        env: HOSTED_ENV,
        markdown: '# note',
        runtime: 'codex',
        sessionId: 'sess-1',
        sessions: sessionsClientFixture({
          ensure: async input => {
            ensureCalls.push(input)
            return { status: 'created', session: sessionFixture(input) }
          },
        }),
      })
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
    expect(ensureCalls).toEqual([
      { id: 'sess-1', parentSessionId: null, agent: 'codex', version: 'unknown' },
    ])
  })

  it('pairs a supplied lower-priority live Grok id with Grok despite a stale Claude id', async () => {
    const ensureCalls: unknown[] = []
    await appendCheckpoint({
      checkpoint: 'compaction',
      entries: entriesClientFixture(),
      env: { ...HOSTED_ENV, CLAUDE_CODE_SESSION_ID: 'stale-claude', GROK_SESSION_ID: 'live-grok' },
      markdown: '# note',
      sessionId: 'live-grok',
      sessions: sessionsClientFixture({
        ensure: async input => {
          ensureCalls.push(input)
          return { status: 'created', session: sessionFixture(input) }
        },
      }),
    })
    expect(ensureCalls).toEqual([
      { id: 'live-grok', parentSessionId: null, agent: 'grok', version: 'unknown' },
    ])
  })

  it('uses a rollout transcript path when hook env omits CODEX_THREAD_ID', async () => {
    const ensureCalls: unknown[] = []
    const cwd = await mkdtemp(join(tmpdir(), 'journal-checkpoint-'))
    try {
      await appendCheckpoint({
        checkpoint: 'compaction',
        cwd,
        entries: entriesClientFixture(),
        env: HOSTED_ENV,
        markdown: '# note',
        sessionId: 'sess-1',
        sessions: sessionsClientFixture({
          ensure: async input => {
            ensureCalls.push(input)
            return { status: 'created', session: sessionFixture(input) }
          },
        }),
        transcriptPath: join(cwd, '.codex', 'sessions', 'rollout-2026-08-23-sess-1.jsonl'),
      })
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
    expect(ensureCalls).toEqual([
      { id: 'sess-1', parentSessionId: null, agent: 'codex', version: 'unknown' },
    ])
  })

  it('fails open when agent identity cannot be resolved', async () => {
    let ensureCalled = false
    const cwd = await mkdtemp(join(tmpdir(), 'journal-checkpoint-'))
    try {
      await appendCheckpoint({
        checkpoint: 'compaction',
        cwd,
        env: HOSTED_ENV,
        markdown: '# note',
        sessionId: 'sess-1',
        sessions: sessionsClientFixture({
          ensure: async input => {
            ensureCalled = true
            return { status: 'created', session: sessionFixture(input) }
          },
        }),
      })
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
    expect(ensureCalled).toBe(false)
  })
})
