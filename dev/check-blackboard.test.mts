import { execFileSync, spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('./check-blackboard.mts', import.meta.url))
const testDirs: string[] = []
const HOSTED_ENV = {
  AGENT_BLACKBOARD_URL: 'https://example.invalid/',
  AGENT_BLACKBOARD_TOKEN: 'test-token',
}
const UNREACHABLE_ENV = {
  AGENT_BLACKBOARD_URL: 'http://127.0.0.1:1/',
  AGENT_BLACKBOARD_TOKEN: 'test-token',
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'check-blackboard-'))
  testDirs.push(dir)
  return dir
}

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

async function makeRepo(): Promise<string> {
  const cwd = await makeTempDir()
  git(cwd, 'init', '-b', 'main')
  git(cwd, 'config', 'user.email', 'tests+check-blackboard@voucha.ai')
  git(cwd, 'config', 'user.name', 'Test User')
  await writeFile(join(cwd, 'tracked.txt'), 'initial\n')
  git(cwd, 'add', 'tracked.txt')
  git(cwd, 'commit', '-m', 'initial')
  return cwd
}

function runScript(
  cwd: string,
  {
    input = '{}',
    env = {},
    path = scriptPath,
    args = [],
    inherit = true,
  }: {
    input?: string
    env?: NodeJS.ProcessEnv
    path?: string
    args?: string[]
    inherit?: boolean
  } = {},
) {
  // inherit: false hands the hook only PATH/HOME, so no ambient harness session id leaks in.
  const base = inherit ? process.env : { HOME: process.env.HOME, PATH: process.env.PATH }
  return spawnSync(process.execPath, [path, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...base, ...env },
    input,
    timeout: 10_000,
  })
}

// Copies the hook and its helper directory under <cwd>/dev so <cwd> acts as the worktree root
// with no node_modules: everything that needs workspace dependencies must fail open.
async function copyProbeScript(cwd: string): Promise<string> {
  const devDir = join(cwd, 'dev')
  await mkdir(devDir)
  await cp(scriptPath, join(devDir, 'check-blackboard.mts'))
  await cp(
    fileURLToPath(new URL('./check-blackboard/', import.meta.url)),
    join(devDir, 'check-blackboard'),
    {
      recursive: true,
    },
  )
  return realpath(join(devDir, 'check-blackboard.mts'))
}

// Simulates a hoisted/stale vouchington-tooling install that predates `vouchington mcp`: the
// package resolves but ships no launcher, unlike the package being absent entirely.
async function installStaleVouchingtonTooling(cwd: string): Promise<void> {
  const packageDir = join(cwd, 'node_modules', 'vouchington-tooling')
  await mkdir(join(packageDir, 'dist'), { recursive: true })
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: 'vouchington-tooling',
      version: '0.1.7',
      type: 'module',
      exports: { '.': './dist/index.mjs', './package.json': './package.json' },
    }),
  )
  await writeFile(join(packageDir, 'dist', 'index.mjs'), 'export {}\n')
}

function additionalContext(stdout: string) {
  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { additionalContext: string; hookEventName: string }
  }
  expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart')
  return output.hookSpecificOutput.additionalContext
}

const CLAUDE_SESSION = { session_id: 'claude-session-1' }

describe('dev/check-blackboard (hook subprocess)', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prints the session id, the launch health, and an advisory when the deployment is unreachable', async () => {
    const result = runScript(await makeRepo(), {
      args: ['claude'],
      env: UNREACHABLE_ENV,
      inherit: false,
      input: JSON.stringify(CLAUDE_SESSION),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).not.toContain('STOP WORK')
    expect(context).toContain('Blackboard sessionId: claude-session-1 ')
    expect(context).toContain('vouchington-tooling MCP server: launchable')
    expect(context).toContain('assessment failed')
    expect(context).toContain('AGENT_BLACKBOARD_URL')
    expect(context).toContain('AGENT_BLACKBOARD_TOKEN')
  })

  it('re-prints only the session id for a compact restart, without the probe', async () => {
    const result = runScript(await makeRepo(), {
      args: ['claude'],
      env: UNREACHABLE_ENV,
      inherit: false,
      input: JSON.stringify({ ...CLAUDE_SESSION, source: 'compact' }),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).toContain('Blackboard sessionId: claude-session-1 ')
    expect(context).not.toContain('launchable')
    expect(context).not.toContain('assessment failed')
  })

  it('prints the session id and health but skips the probe when CHECK_BLACKBOARD_SKIP=1', async () => {
    const result = runScript(await makeRepo(), {
      args: ['claude'],
      env: { ...UNREACHABLE_ENV, CHECK_BLACKBOARD_SKIP: '1' },
      inherit: false,
      input: JSON.stringify(CLAUDE_SESSION),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).toContain('Blackboard sessionId: claude-session-1 ')
    expect(context).toContain('launchable')
    expect(context).not.toContain('assessment failed')
  })

  it('prints the id, the health, and the sandbox skip note under SANDBOX_RUNTIME', async () => {
    const result = runScript(await makeRepo(), {
      args: ['claude'],
      env: { AGENT_BLACKBOARD_URL: HOSTED_ENV.AGENT_BLACKBOARD_URL, SANDBOX_RUNTIME: '1' },
      inherit: false,
      input: JSON.stringify(CLAUDE_SESSION),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).not.toContain('STOP WORK')
    expect(context).toContain('Blackboard sessionId: claude-session-1 ')
    expect(context).toContain('sandbox')
    expect(context).toContain('NOT an outage')
  })

  it('reports an unresolved id instead of guessing when the payload carries none', async () => {
    const result = runScript(await makeRepo(), {
      args: ['claude'],
      env: { CHECK_BLACKBOARD_SKIP: '1' },
      inherit: false,
    })

    expect(result.status).toBe(0)
    expect(additionalContext(result.stdout)).toContain('Blackboard sessionId: NOT RESOLVED')
  })

  it('fails open with a loud launch failure when workspace dependencies are absent', async () => {
    const cwd = await makeRepo()
    const path = await copyProbeScript(cwd)
    const result = runScript(cwd, {
      args: ['claude'],
      env: UNREACHABLE_ENV,
      inherit: false,
      input: JSON.stringify(CLAUDE_SESSION),
      path,
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).toContain('STOP WORK')
    expect(context).toContain('cannot launch')
    expect(context).toContain('./dev/initialize monorepo')
    // Resolution cannot load, so no harness is known and the step lists every harness.
    expect(context).toContain('then /mcp reconnect (Claude Code), restart Codex or Grok')
    expect(context).toContain('Blackboard sessionId: NOT RESOLVED')
    expect(context).not.toContain('assessment failed')
  })

  it('reports the same launch failure when a stale install predates vouchington mcp', async () => {
    const cwd = await makeRepo()
    const path = await copyProbeScript(cwd)
    await installStaleVouchingtonTooling(cwd)
    const result = runScript(cwd, {
      args: ['codex'],
      env: UNREACHABLE_ENV,
      inherit: false,
      path,
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).toContain('STOP WORK')
    expect(context).toContain('node_modules/.bin/vouchington')
    expect(context).toContain('restart Codex or Grok')
  })

  it('stays silent outside a git repo', async () => {
    const result = runScript(await makeTempDir(), { env: UNREACHABLE_ENV })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })
})
