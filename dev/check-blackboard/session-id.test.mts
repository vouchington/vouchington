import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { sessionPersistPath } from '../agent-session-id/persist.mts'
import { resolveSessionId } from '../agent-session-id/resolve.mts'
import { resolveHookSessionId } from './session-id.mts'
import { renderSessionLine } from './session-line.mts'

const testDirs: string[] = []

async function makeWorktree(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'check-blackboard-session-'))
  testDirs.push(cwd)
  await mkdir(join(cwd, '.git'))
  return cwd
}

describe('resolveHookSessionId', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prints the id every other repository tool resolves for a Claude session', async () => {
    const cwd = await makeWorktree()
    const payload = { session_id: 'claude-abc' }
    const hook = resolveHookSessionId({ cwd, env: {}, harnessArg: 'claude', payload })
    // A Bash tool call in that session sees CLAUDE_CODE_SESSION_ID; the hook payload carries the same id.
    expect(hook).toBe(resolveSessionId({ cwd, env: { CLAUDE_CODE_SESSION_ID: 'claude-abc' } }))
    expect(hook).toBe(resolveSessionId({ cwd, env: {}, sessionIdArg: payload.session_id }))
  })

  it('takes the ambient Claude id when the hook env already has one', async () => {
    const cwd = await makeWorktree()
    const env = { CLAUDE_CODE_SESSION_ID: 'claude-env' }
    expect(resolveHookSessionId({ cwd, env, harnessArg: 'claude', payload: {} })).toBe(
      resolveSessionId({ cwd, env }),
    )
  })

  it('never substitutes a stale persisted Cursor id for a Claude session', async () => {
    const cwd = await makeWorktree()
    await mkdir(join(cwd, '.local'))
    await writeFile(sessionPersistPath(cwd, 'cursor'), 'stale-cursor\n', 'utf8')
    const hook = resolveHookSessionId({
      cwd,
      env: {},
      harnessArg: 'claude',
      payload: { session_id: 'claude-fresh' },
    })
    expect(hook).toBe('claude-fresh')
  })

  it('persists and prints the payload thread id for a root Codex session', async () => {
    const cwd = await makeWorktree()
    const payload = { session_id: 'codex-thread-1' }
    const hook = resolveHookSessionId({ cwd, env: {}, harnessArg: 'codex', payload })
    expect(hook).toBe('codex-thread-1')
    expect((await readFile(sessionPersistPath(cwd, 'codex'), 'utf8')).trim()).toBe('codex-thread-1')
    // Later repository tools resolve the same id through the root-Codex flag.
    expect(resolveSessionId({ cwd, env: {}, rootCodex: true })).toBe(hook)
  })

  it('falls back to the persisted root Codex id when the payload has none', async () => {
    const cwd = await makeWorktree()
    await mkdir(join(cwd, '.local'))
    await writeFile(sessionPersistPath(cwd, 'codex'), 'codex-persisted\n', 'utf8')
    expect(resolveHookSessionId({ cwd, env: {}, harnessArg: 'codex', payload: {} })).toBe(
      resolveSessionId({ cwd, env: {}, rootCodex: true }),
    )
  })

  it('prints the ambient thread id for a Codex child session', async () => {
    const cwd = await makeWorktree()
    const env = { CODEX_THREAD_ID: 'codex-child' }
    const hook = resolveHookSessionId({ cwd, env, harnessArg: 'codex', payload: {} })
    expect(hook).toBe(resolveSessionId({ cwd, env }))
    expect(hook).toBe('codex-child')
  })

  it('returns nothing when no id exists and rejects ids the repository grammar refuses', async () => {
    const cwd = await makeWorktree()
    expect(
      resolveHookSessionId({ cwd, env: {}, harnessArg: 'claude', payload: {} }),
    ).toBeUndefined()
    expect(
      resolveHookSessionId({
        cwd,
        env: {},
        harnessArg: 'claude',
        payload: { session_id: 'has space/slash' },
      }),
    ).toBeUndefined()
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
