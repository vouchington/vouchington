import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readPersistedSessionId, sessionPersistPath } from '../agent-session-id/persist.mts'
import { resolveSessionId } from '../agent-session-id/resolve.mts'
import { resolveHookSession } from './session-id.mts'
import { renderSessionLine } from './session-line.mts'

const testDirs: string[] = []

async function makeWorktree(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'check-blackboard-session-'))
  testDirs.push(cwd)
  await mkdir(join(cwd, '.git'))
  return cwd
}

async function persist(cwd: string, agent: 'codex' | 'cursor' | 'grok', id: string) {
  await mkdir(join(cwd, '.local'), { recursive: true })
  await writeFile(sessionPersistPath(cwd, agent), `${id}\n`, 'utf8')
}

// What a harness launched from a Claude session inherits, plus a leftover Cursor session file.
async function leakyWorktree(): Promise<{ cwd: string; env: NodeJS.ProcessEnv }> {
  const cwd = await makeWorktree()
  await persist(cwd, 'cursor', 'stale-cursor')
  return { cwd, env: { CLAUDE_CODE_SESSION_ID: 'inherited-claude' } }
}

describe('resolveHookSession payload-first resolution', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prints the payload id for a Claude hook despite a stale Cursor file and a leaked env id', async () => {
    const { cwd, env } = await leakyWorktree()
    const session = resolveHookSession({
      cwd,
      env: { ...env, CODEX_THREAD_ID: 'inherited-codex' },
      harnessArg: 'claude',
      payload: { session_id: 'claude-fresh' },
    })
    expect(session).toEqual({ runtime: 'claude', sessionId: 'claude-fresh' })
    expect(session.sessionId).toBe(resolveSessionId({ cwd, env: {}, sessionIdArg: 'claude-fresh' }))
  })

  it('falls back to the Claude session env only when the payload has no id', async () => {
    const cwd = await makeWorktree()
    const env = { CLAUDE_CODE_SESSION_ID: 'claude-env' }
    expect(resolveHookSession({ cwd, env, harnessArg: 'claude', payload: {} }).sessionId).toBe(
      'claude-env',
    )
  })

  it('persists and prints the payload thread id for a root Codex despite leaked state', async () => {
    const { cwd, env } = await leakyWorktree()
    const payload = { session_id: 'codex-thread-1' }
    const session = resolveHookSession({ cwd, env, harnessArg: 'codex', payload })
    expect(session).toEqual({ runtime: 'codex', sessionId: 'codex-thread-1' })
    expect((await readFile(sessionPersistPath(cwd, 'codex'), 'utf8')).trim()).toBe('codex-thread-1')
    // Later repository tools resolve the same id through the root-Codex flag.
    expect(resolveSessionId({ cwd, env: {}, rootCodex: true })).toBe('codex-thread-1')
  })

  it('lets CODEX_THREAD_ID beat the payload and a leaked Claude id without persisting', async () => {
    const { cwd, env } = await leakyWorktree()
    const session = resolveHookSession({
      cwd,
      env: { ...env, CODEX_THREAD_ID: 'codex-child' },
      harnessArg: 'codex',
      payload: { session_id: 'other-payload' },
    })
    expect(session).toEqual({ runtime: 'codex', sessionId: 'codex-child' })
    expect(readPersistedSessionId(cwd, 'codex')).toBeUndefined()
  })

  it('falls back to the persisted root Codex id when the payload has none', async () => {
    const cwd = await makeWorktree()
    await persist(cwd, 'codex', 'codex-persisted')
    expect(resolveHookSession({ cwd, env: {}, harnessArg: 'codex', payload: {} }).sessionId).toBe(
      'codex-persisted',
    )
  })

  it('reports a root Codex persistence failure instead of an id', async () => {
    const cwd = await makeWorktree()
    await writeFile(join(cwd, '.local'), 'not a directory\n', 'utf8')
    const session = resolveHookSession({
      cwd,
      env: {},
      harnessArg: 'codex',
      payload: { session_id: 'codex-thread-1' },
    })
    expect(session.sessionId).toBeUndefined()
    expect(session.failure).toContain('failed to persist root Codex session id')
    expect(session.runtime).toBe('codex')
  })

  it('prints the payload id with an unknown runtime when no argument or transcript names one', async () => {
    const { cwd, env } = await leakyWorktree()
    const session = resolveHookSession({ cwd, env, payload: { session_id: 'codex-thread-2' } })
    // The leaked Claude id neither names the runtime nor outranks the payload.
    expect(session).toEqual({ sessionId: 'codex-thread-2' })
  })

  it('reads a Codex transcript path as the runtime when the main checkout hook has no argument', async () => {
    const { cwd, env } = await leakyWorktree()
    const payload = {
      session_id: 'codex-thread-3',
      transcript_path: '/Users/someone/.codex/sessions/2026/09/rollout-codex-thread-3.jsonl',
    }
    expect(resolveHookSession({ cwd, env, payload })).toEqual({
      runtime: 'codex',
      sessionId: 'codex-thread-3',
    })
    expect(readPersistedSessionId(cwd, 'codex')).toBe('codex-thread-3')
  })

  it('uses the only own session env as a last resort when the payload has no id', async () => {
    const cwd = await makeWorktree()
    const session = resolveHookSession({ cwd, env: { CODEX_THREAD_ID: 'codex-env' }, payload: {} })
    expect(session).toEqual({ sessionId: 'codex-env' })
  })

  it('asks for an explicit id when several harness envs are set and the payload has none', async () => {
    const { cwd, env } = await leakyWorktree()
    const session = resolveHookSession({
      cwd,
      env: { ...env, CODEX_THREAD_ID: 'codex-env' },
      payload: {},
    })
    expect(session.sessionId).toBeUndefined()
    expect(session.runtime).toBeUndefined()
    expect(session.failure).toContain('CLAUDE_CODE_SESSION_ID, CODEX_THREAD_ID')
    expect(session.failure).toContain('--session-id')
  })

  it('returns nothing for an empty hook and for ids the repository grammar refuses', async () => {
    const { cwd } = await leakyWorktree()
    expect(resolveHookSession({ cwd, env: {}, payload: {} })).toEqual({})
    const refused = resolveHookSession({
      cwd,
      env: {},
      harnessArg: 'claude',
      payload: { session_id: 'has space/slash' },
    })
    expect(refused).toEqual({ runtime: 'claude' })
  })
})

describe('resolveHookSession Grok and Cursor hooks', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prefers GROK_SESSION_ID, then the payload, over a leaked Claude id and a Cursor file', async () => {
    const { cwd, env } = await leakyWorktree()
    const grokEnv = { ...env, GROK_SESSION_ID: 'grok-env', GROK_HOOK_EVENT: 'SessionStart' }
    expect(
      resolveHookSession({ cwd, env: grokEnv, harnessArg: 'claude', payload: { session_id: 'p' } }),
    ).toEqual({ runtime: 'grok', sessionId: 'grok-env' })
    const payloadOnly = { ...env, GROK_HOOK_EVENT: 'SessionStart' }
    expect(
      resolveHookSession({
        cwd,
        env: payloadOnly,
        harnessArg: 'claude',
        payload: { session_id: 'p' },
      }).sessionId,
    ).toBe('p')
  })

  it('reads only the Grok persisted file for a Grok hook without an id', async () => {
    const { cwd, env } = await leakyWorktree()
    const grokEnv = { ...env, GROK_HOOK_EVENT: 'SessionStart' }
    expect(
      resolveHookSession({ cwd, env: grokEnv, harnessArg: 'claude', payload: {} }).sessionId,
    ).toBeUndefined()
    await persist(cwd, 'grok', 'grok-file')
    expect(
      resolveHookSession({ cwd, env: grokEnv, harnessArg: 'claude', payload: {} }).sessionId,
    ).toBe('grok-file')
  })

  it('takes the Cursor conversation id over a leaked Claude id and never reads the Grok file', async () => {
    const { cwd, env } = await leakyWorktree()
    await persist(cwd, 'grok', 'stale-grok')
    const cursorPayload = { cursor_version: '1.0.0', conversation_id: 'cursor-conversation' }
    expect(resolveHookSession({ cwd, env, harnessArg: 'claude', payload: cursorPayload })).toEqual({
      runtime: 'cursor',
      sessionId: 'cursor-conversation',
    })
    const idless = { cursor_version: '1.0.0' }
    expect(resolveHookSession({ cwd, env, harnessArg: 'claude', payload: idless }).sessionId).toBe(
      'stale-cursor',
    )
  })
})

describe('renderSessionLine', () => {
  it('names the id and the child-agent rule', () => {
    const line = renderSessionLine('abc-123')
    expect(line).toContain('Blackboard sessionId: abc-123')
    expect(line).toContain('session_ensure')
  })

  it('reports an unresolved id with the cause and stops journaling', () => {
    expect(renderSessionLine(undefined)).toContain('NOT RESOLVED (no id in this hook payload')
    expect(renderSessionLine(undefined, 'Cannot find module')).toContain(
      'NOT RESOLVED (Cannot find module)',
    )
    expect(renderSessionLine(undefined)).toContain('stop journaling and report it')
  })
})
