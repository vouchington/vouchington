import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('../check-blackboard.mts', import.meta.url))
const testDirs: string[] = []

// A linked worktree can run the main checkout's older hook command, so each case runs the real
// hook the way a harness does: stdin payload, optional argv token, and the env the harness
// leaves behind. CLAUDE_CODE_SESSION_ID models a harness launched from a Claude session.
const LEAKED_ENV = { CLAUDE_CODE_SESSION_ID: 'leaked-claude', CHECK_BLACKBOARD_SKIP: '1' }

async function makeRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'check-blackboard-runtime-'))
  testDirs.push(cwd)
  execFileSync('git', ['init', '-b', 'main'], { cwd, stdio: 'ignore' })
  return cwd
}

async function runHook(options: {
  args?: string[]
  env: NodeJS.ProcessEnv
  payload: Record<string, unknown>
}): Promise<string> {
  const result = spawnSync(process.execPath, [scriptPath, ...(options.args ?? [])], {
    cwd: await makeRepo(),
    encoding: 'utf8',
    env: { HOME: process.env.HOME, PATH: process.env.PATH, ...options.env },
    input: JSON.stringify(options.payload),
    timeout: 10_000,
  })
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  const output = JSON.parse(result.stdout) as { hookSpecificOutput: { additionalContext: string } }
  return output.hookSpecificOutput.additionalContext
}

describe('dev/check-blackboard session id and health line per harness', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prints the payload id and the Codex tool names for a Codex hook with a leaked Claude id', async () => {
    const context = await runHook({
      args: ['codex'],
      env: { ...LEAKED_ENV, CODEX_THREAD_ID: 'codex-thread-1' },
      payload: { session_id: 'codex-thread-1' },
    })
    expect(context).toContain('Blackboard sessionId: codex-thread-1 ')
    expect(context).not.toContain('leaked-claude')
    expect(context).toContain('mcp__vouchington_tooling__*')
    expect(context).not.toContain('mcp__vouchington-tooling__*')
  })

  it('prints the payload id for a hook with no harness argument and names every tool form', async () => {
    const context = await runHook({ env: LEAKED_ENV, payload: { session_id: 'codex-thread-2' } })
    expect(context).toContain('Blackboard sessionId: codex-thread-2 ')
    expect(context).not.toContain('leaked-claude')
    expect(context).toContain('mcp__vouchington_tooling__*')
    expect(context).toContain('mcp__vouchington-tooling__*')
    expect(context).toContain('search for journal_append')
  })

  it('names the Claude tool form for a Claude hook', async () => {
    const context = await runHook({
      args: ['claude'],
      env: LEAKED_ENV,
      payload: { session_id: 'claude-fresh' },
    })
    expect(context).toContain('Blackboard sessionId: claude-fresh ')
    expect(context).toContain('mcp__vouchington-tooling__*')
    expect(context).toContain('then /mcp reconnect')
  })

  it('prints the Grok id and the discovery path for a Grok hook', async () => {
    const context = await runHook({
      args: ['claude'],
      env: { ...LEAKED_ENV, GROK_HOOK_EVENT: 'SessionStart', GROK_SESSION_ID: 'grok-env' },
      payload: { session_id: 'grok-payload' },
    })
    expect(context).toContain('Blackboard sessionId: grok-env ')
    expect(context).toContain('search_tool')
    expect(context).toContain('then restart Grok')
    expect(context).not.toContain('mcp__')
  })

  it('prints the Cursor id and the server approval step for a Cursor hook', async () => {
    const context = await runHook({
      args: ['claude'],
      env: LEAKED_ENV,
      payload: { conversation_id: 'cursor-conversation', cursor_version: '1.0.0' },
    })
    expect(context).toContain('Blackboard sessionId: cursor-conversation ')
    expect(context).toContain('GetDynamicTools')
    expect(context).toContain('cursor-agent mcp enable vouchington-tooling')
    expect(context).toContain('--approve-mcps')
  })

  it('asks for an explicit id instead of picking one of several leaked envs', async () => {
    const context = await runHook({
      env: { ...LEAKED_ENV, CODEX_THREAD_ID: 'codex-thread-3' },
      payload: {},
    })
    expect(context).toContain('Blackboard sessionId: NOT RESOLVED')
    expect(context).toContain('CLAUDE_CODE_SESSION_ID, CODEX_THREAD_ID')
    expect(context).toContain('--session-id')
  })
})
