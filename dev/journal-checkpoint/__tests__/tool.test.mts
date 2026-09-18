import { unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  entriesClientFixture,
  HOSTED_ENV,
  sessionFixture,
  sessionsClientFixture,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { counterPath } from '../failure-counter.mts'
import { runToolCheckpoint } from '../tool.mts'

// Mirrors tool.mts's own `path.resolve(import.meta.dirname, '..', '..')` (dev/journal-checkpoint
// -> repo root); this test file lives one directory deeper, hence the extra `..`. The failure path
// isn't baseDir-injectable through runToolCheckpoint, so each test's counter file lands in the
// real OS tmpdir() — clean those up explicitly rather than leaving droppings behind.
const worktreeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const usedSessionIds: string[] = []

type AppendCall = { sessionId: string; data: Record<string, unknown> }

function spyingEntries(calls: AppendCall[]) {
  return entriesClientFixture({
    append: async input => {
      calls.push(input)
      return { sessionId: input.sessionId, createdAt: '2026-07-20T00:00:00.000Z', data: input.data }
    },
  })
}

// runToolCheckpoint's failure path scopes its counter file by (sessionId, worktreeRoot), where
// worktreeRoot is derived internally from this module's own location — not injectable. Each test
// therefore uses a fresh, unique session id so counters never leak across tests/runs sharing the
// same real tmpdir() the counter file lives under.
let sessionCounter = 0
function freshSessionId(): string {
  sessionCounter += 1
  const sessionId = `tool-checkpoint-test-${sessionCounter}`
  usedSessionIds.push(sessionId)
  return sessionId
}

describe('runToolCheckpoint', () => {
  afterEach(async () => {
    await Promise.all(
      usedSessionIds.splice(0).map(async sessionId => {
        const file = counterPath(sessionId, worktreeRoot)
        if (file) await unlink(file).catch(() => {})
      }),
    )
  })

  it('is a no-op for a blank session id', async () => {
    const calls: AppendCall[] = []
    await runToolCheckpoint(
      {
        session_id: '',
        tool_input: { command: 'npx vitest run x' },
        tool_response: 'Error: Exit code 1: boom',
      },
      HOSTED_ENV,
      { entries: spyingEntries(calls) },
    )
    expect(calls).toHaveLength(0)
  })

  it('does not journal on the 1st or 2nd tracked failure, only the 3rd', async () => {
    const sessionId = freshSessionId()
    const calls: AppendCall[] = []
    const payload = (n: number) => ({
      session_id: sessionId,
      tool_input: { command: `npx vitest run failing-${n}.test.mts` },
      tool_response: `Error: Exit code 1: failure ${n}`,
    })

    await runToolCheckpoint(payload(1), HOSTED_ENV, { entries: spyingEntries(calls) })
    expect(calls).toHaveLength(0)

    await runToolCheckpoint(payload(2), HOSTED_ENV, { entries: spyingEntries(calls) })
    expect(calls).toHaveLength(0)

    await runToolCheckpoint(
      payload(3),
      HOSTED_ENV,
      {
        entries: spyingEntries(calls),
        sessions: sessionsClientFixture(),
      },
      'claude',
    )
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call.sessionId).toBe(sessionId)
    expect(call.data.type).toBe('journal')
    expect(call.data.checkpoint).toBe('command-failure')
    const markdown = call.data.markdown as string
    expect(markdown).toContain('## Auto-append: repeated command failure (failure #3)')
    expect(markdown).toContain('npx vitest run failing-1.test.mts')
    expect(markdown).toContain('npx vitest run failing-2.test.mts')
    expect(markdown).toContain('npx vitest run failing-3.test.mts')
  })

  it('ignores a low-signal command failure', async () => {
    const sessionId = freshSessionId()
    const calls: AppendCall[] = []
    await runToolCheckpoint(
      {
        session_id: sessionId,
        tool_input: { command: 'ls -la' },
        tool_response: 'Error: Exit code 1: boom',
      },
      HOSTED_ENV,
      { entries: spyingEntries(calls) },
    )
    expect(calls).toHaveLength(0)
  })

  it('journals a gh pr create milestone', async () => {
    const sessionId = freshSessionId()
    const calls: AppendCall[] = []
    await runToolCheckpoint(
      {
        session_id: sessionId,
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_response: {
          stderr: '',
          stdout: 'https://github.com/vouchington/vouchington/pull/9358\n',
        },
      },
      HOSTED_ENV,
      { entries: spyingEntries(calls), sessions: sessionsClientFixture() },
      'claude',
    )

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call.sessionId).toBe(sessionId)
    expect(call.data.checkpoint).toBe('pr-create')
    const markdown = call.data.markdown as string
    expect(markdown).toContain('## Auto-append: PR created')
    expect(markdown).toContain('https://github.com/vouchington/vouchington/pull/9358')
  })

  it('journals a git push milestone', async () => {
    const sessionId = freshSessionId()
    const calls: AppendCall[] = []
    await runToolCheckpoint(
      {
        session_id: sessionId,
        tool_input: { command: 'git push' },
        tool_response: {
          stderr:
            'To github.com:vouchington/vouchington.git\n   abc123..def456  my-branch -> my-branch\n',
          stdout: '',
        },
      },
      HOSTED_ENV,
      { entries: spyingEntries(calls), sessions: sessionsClientFixture() },
      'claude',
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.data.checkpoint).toBe('push')
    const markdown = calls[0]?.data.markdown as string
    expect(markdown).toContain('## Auto-append: Pushed')
  })

  it('ensures agent codex from runtime argv even when CODEX_THREAD_ID is absent', async () => {
    const sessionId = freshSessionId()
    const ensureCalls: unknown[] = []
    await runToolCheckpoint(
      {
        session_id: sessionId,
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_response: {
          stderr: '',
          stdout: 'https://github.com/vouchington/vouchington/pull/9358\n',
        },
      },
      HOSTED_ENV,
      {
        entries: spyingEntries([]),
        sessions: sessionsClientFixture({
          ensure: async input => {
            ensureCalls.push(input)
            return { status: 'created', session: sessionFixture(input) }
          },
        }),
      },
      'codex',
    )

    expect(ensureCalls).toEqual([
      { id: sessionId, parentSessionId: null, agent: 'codex', version: 'unknown' },
    ])
  })

  it('does not journal a rejected git push', async () => {
    const sessionId = freshSessionId()
    const calls: AppendCall[] = []
    await runToolCheckpoint(
      {
        session_id: sessionId,
        tool_input: { command: 'git push' },
        tool_response: {
          stderr:
            '! [rejected]  my-branch -> my-branch (non-fast-forward)\nerror: failed to push\n',
          stdout: '',
        },
      },
      HOSTED_ENV,
      { entries: spyingEntries(calls) },
    )
    expect(calls).toHaveLength(0)
  })
})
