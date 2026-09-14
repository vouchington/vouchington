import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  entriesClientFixture,
  HOSTED_ENV,
  sessionsClientFixture,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { appendCheckpoint, type AppendCheckpointInput } from '../append.mts'

// Every case below exercises appendCheckpoint's guards or connect/append plumbing, none of which
// varies by checkpoint kind or markdown body — supplying those two defaults here keeps each call
// site scoped to what it actually asserts on.
function callAppendCheckpoint(
  overrides: Omit<AppendCheckpointInput, 'checkpoint' | 'markdown'> &
    Partial<Pick<AppendCheckpointInput, 'checkpoint' | 'markdown'>>,
): ReturnType<typeof appendCheckpoint> {
  return appendCheckpoint({ checkpoint: 'compaction', markdown: '# note', ...overrides })
}

describe('appendCheckpoint', () => {
  it('is a no-op under SANDBOX_RUNTIME even with a full fixture set', async () => {
    let appendCalled = false
    const entries = entriesClientFixture({
      append: async input => {
        appendCalled = true
        return {
          sessionId: input.sessionId,
          createdAt: '2026-07-20T00:00:00.000Z',
          data: input.data,
        }
      },
    })

    await callAppendCheckpoint({
      entries,
      env: { ...HOSTED_ENV, SANDBOX_RUNTIME: '1' },
      sessionId: 'sess-1',
      sessions: sessionsClientFixture(),
    })

    expect(appendCalled).toBe(false)
  })

  it('is a no-op when JOURNAL_CHECKPOINT_SKIP=1', async () => {
    let appendCalled = false
    const entries = entriesClientFixture({
      append: async input => {
        appendCalled = true
        return {
          sessionId: input.sessionId,
          createdAt: '2026-07-20T00:00:00.000Z',
          data: input.data,
        }
      },
    })

    await callAppendCheckpoint({
      entries,
      env: { ...HOSTED_ENV, JOURNAL_CHECKPOINT_SKIP: '1' },
      sessionId: 'sess-1',
      sessions: sessionsClientFixture(),
    })

    expect(appendCalled).toBe(false)
  })

  it('is a no-op when AGENT_BLACKBOARD_URL is missing', async () => {
    let appendCalled = false
    const entries = entriesClientFixture({
      append: async input => {
        appendCalled = true
        return {
          sessionId: input.sessionId,
          createdAt: '2026-07-20T00:00:00.000Z',
          data: input.data,
        }
      },
    })

    await callAppendCheckpoint({
      entries,
      env: { AGENT_BLACKBOARD_TOKEN: 'test-token' },
      sessionId: 'sess-1',
      sessions: sessionsClientFixture(),
    })

    expect(appendCalled).toBe(false)
  })

  it('is a no-op when AGENT_BLACKBOARD_TOKEN is missing', async () => {
    let appendCalled = false
    const entries = entriesClientFixture({
      append: async input => {
        appendCalled = true
        return {
          sessionId: input.sessionId,
          createdAt: '2026-07-20T00:00:00.000Z',
          data: input.data,
        }
      },
    })

    await callAppendCheckpoint({
      entries,
      env: { AGENT_BLACKBOARD_URL: 'https://example.invalid/' },
      sessionId: 'sess-1',
      sessions: sessionsClientFixture(),
    })

    expect(appendCalled).toBe(false)
  })

  it('is a no-op for a blank session id', async () => {
    let appendCalled = false
    const entries = entriesClientFixture({
      append: async input => {
        appendCalled = true
        return {
          sessionId: input.sessionId,
          createdAt: '2026-07-20T00:00:00.000Z',
          data: input.data,
        }
      },
    })

    await callAppendCheckpoint({
      entries,
      env: HOSTED_ENV,
      sessionId: '',
      sessions: sessionsClientFixture(),
    })

    expect(appendCalled).toBe(false)
  })

  it('ensures the session and appends the journal entry when every guard passes', async () => {
    const ensureCalls: unknown[] = []
    const appendCalls: unknown[] = []
    const sessions = sessionsClientFixture({
      ensure: async input => {
        ensureCalls.push(input)
        return {
          status: 'exists',
          session: {
            id: input.id,
            agent: input.agent,
            version: input.version,
            parentSessionId: input.parentSessionId,
            createdAt: '2026-07-20T00:00:00.000Z',
            lastEntryAt: null,
            archivedAt: null,
            data: {},
          },
        }
      },
    })
    const entries = entriesClientFixture({
      append: async input => {
        appendCalls.push(input)
        return {
          sessionId: input.sessionId,
          createdAt: '2026-07-20T00:00:00.000Z',
          data: input.data,
        }
      },
    })

    const cwd = await mkdtemp(join(tmpdir(), 'journal-checkpoint-'))
    try {
      await callAppendCheckpoint({
        cwd,
        entries,
        env: HOSTED_ENV,
        runtime: 'claude',
        sessionId: 'sess-1',
        sessions,
      })

      expect(ensureCalls).toEqual([
        { id: 'sess-1', parentSessionId: null, agent: 'claude-code', version: 'unknown' },
      ])
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
    expect(appendCalls).toHaveLength(1)
    const [call] = appendCalls as [{ sessionId: string; data: Record<string, unknown> }]
    expect(call.sessionId).toBe('sess-1')
    expect(call.data.type).toBe('journal')
    expect(call.data.checkpoint).toBe('compaction')
    expect(call.data.markdown).toBe('# note')
    expect(typeof call.data.timestamp).toBe('string')
  })
})
