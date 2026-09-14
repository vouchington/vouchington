import { execFileSync, spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { sessionsClientFixture } from './test-helpers/blackboard/client-fixtures.mts'
import { runCheckBlackboard } from './check-blackboard.mts'

const scriptPath = fileURLToPath(new URL('./check-blackboard.mts', import.meta.url))
const clientModulePath = fileURLToPath(new URL('./blackboard/client.mts', import.meta.url))
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

describe('runCheckBlackboard', () => {
  it('resolves when the bounded probe succeeds', async () => {
    await expect(
      runCheckBlackboard({ env: HOSTED_ENV, sessions: sessionsClientFixture() }),
    ).resolves.toBeUndefined()
  })

  it('propagates a probe failure', async () => {
    const sessions = sessionsClientFixture({
      list: async () => {
        throw new Error('agent-blackboard request failed: GET /sessions -> 500')
      },
    })

    await expect(runCheckBlackboard({ env: HOSTED_ENV, sessions })).rejects.toThrow(
      /sessions list probe failed.*-> 500/s,
    )
  })

  it('propagates a missing-URL failure', async () => {
    await expect(
      runCheckBlackboard({ env: { AGENT_BLACKBOARD_TOKEN: 'test-token' } }),
    ).rejects.toThrow(/AGENT_BLACKBOARD_URL is not set/)
  })

  it('propagates a missing-token failure', async () => {
    await expect(
      runCheckBlackboard({ env: { AGENT_BLACKBOARD_URL: HOSTED_ENV.AGENT_BLACKBOARD_URL } }),
    ).rejects.toThrow(/AGENT_BLACKBOARD_TOKEN is not set/)
  })
})

function runScript(
  cwd: string,
  {
    input = '{}',
    env = {},
    path = scriptPath,
  }: { input?: string; env?: NodeJS.ProcessEnv; path?: string } = {},
) {
  return spawnSync(process.execPath, [path], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    input,
    timeout: 10_000,
  })
}

async function copyProbeScript(cwd: string, includeBlackboardModules = false): Promise<string> {
  const copiedScriptPath = join(cwd, 'check-blackboard.mts')
  await copyFile(scriptPath, copiedScriptPath)
  if (includeBlackboardModules) {
    const blackboardDir = join(cwd, 'blackboard')
    await mkdir(blackboardDir)
    await copyFile(clientModulePath, join(blackboardDir, 'client.mts'))
  }
  return realpath(copiedScriptPath)
}

// Simulates a hoisted/stale vouchington-tooling install that predates the ./agent-blackboard
// export — mechanically distinct from the package being absent entirely (ERR_MODULE_NOT_FOUND).
async function installStaleVouchingtonTooling(cwd: string): Promise<void> {
  const packageDir = join(cwd, 'node_modules', 'vouchington-tooling')
  await mkdir(packageDir, { recursive: true })
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: 'vouchington-tooling',
      version: '0.1.7',
      type: 'module',
      exports: {
        '.': './dist/index.mjs',
        './package.json': './package.json',
      },
    }),
  )
  await mkdir(join(packageDir, 'dist'), { recursive: true })
  await writeFile(join(packageDir, 'dist', 'index.mjs'), 'export {}\n')
}

function additionalContext(stdout: string) {
  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { additionalContext: string; hookEventName: string }
  }
  expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart')
  return output.hookSpecificOutput.additionalContext
}

describe('dev/check-blackboard (hook subprocess)', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('emits a stop-work directive when the blackboard is unreachable', async () => {
    const result = runScript(await makeRepo(), { env: UNREACHABLE_ENV })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).toContain('STOP WORK')
    expect(context).toContain('agent-blackboard is unavailable')
    expect(context).toContain('AGENT_BLACKBOARD_URL')
    expect(context).toContain('AGENT_BLACKBOARD_TOKEN')
  })

  it('stays silent for a compact session restart even when unreachable', async () => {
    const result = runScript(await makeRepo(), {
      input: JSON.stringify({ source: 'compact' }),
      env: UNREACHABLE_ENV,
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('stays silent when CHECK_BLACKBOARD_SKIP=1 even when unreachable', async () => {
    const result = runScript(await makeRepo(), {
      env: { ...UNREACHABLE_ENV, CHECK_BLACKBOARD_SKIP: '1' },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('honors CHECK_BLACKBOARD_SKIP before loading workspace dependencies', async () => {
    const cwd = await makeRepo()
    const path = await copyProbeScript(cwd)
    const result = runScript(cwd, {
      env: { ...UNREACHABLE_ENV, CHECK_BLACKBOARD_SKIP: '1' },
      path,
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('honors compact restarts before loading workspace dependencies', async () => {
    const cwd = await makeRepo()
    const path = await copyProbeScript(cwd)
    const result = runScript(cwd, {
      input: JSON.stringify({ source: 'compact' }),
      env: UNREACHABLE_ENV,
      path,
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('honors the sandbox guard before loading workspace dependencies', async () => {
    const cwd = await makeRepo()
    const path = await copyProbeScript(cwd)
    const result = runScript(cwd, { env: { SANDBOX_RUNTIME: '1' }, path })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).not.toContain('STOP WORK')
    expect(context).toContain('sandbox')
  })

  it('honors the non-repository guard before loading workspace dependencies', async () => {
    const cwd = await makeTempDir()
    const path = await copyProbeScript(cwd)
    const result = runScript(cwd, { env: UNREACHABLE_ENV, path })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('reports the install command when workspace dependencies are absent', async () => {
    const cwd = await makeRepo()
    const path = await copyProbeScript(cwd, true)
    const result = runScript(cwd, { env: UNREACHABLE_ENV, path })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).toContain('STOP WORK')
    expect(context).toContain('vouchington-tooling agent-blackboard helpers are not installed')
    expect(context).toContain('pnpm install')
    expect(context).toContain('workspace-setup')
    expect(context).not.toContain('verify the hosted agent-blackboard')
  })

  it('reports ./dev/initialize monorepo when a stale install predates the agent-blackboard export', async () => {
    const cwd = await makeRepo()
    const path = await copyProbeScript(cwd, true)
    await installStaleVouchingtonTooling(cwd)
    const result = runScript(cwd, { env: UNREACHABLE_ENV, path })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).toContain('STOP WORK')
    expect(context).toContain('predates the ./agent-blackboard export')
    expect(context).toContain('./dev/initialize monorepo')
    expect(context).toContain('workspace-setup')
    expect(context).not.toContain('verify the hosted agent-blackboard')
  })

  it('reports a sandbox skip instead of a stop-work directive under SANDBOX_RUNTIME', async () => {
    const result = runScript(await makeRepo(), {
      env: {
        AGENT_BLACKBOARD_URL: HOSTED_ENV.AGENT_BLACKBOARD_URL,
        SANDBOX_RUNTIME: '1',
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const context = additionalContext(result.stdout)
    expect(context).not.toContain('STOP WORK')
    expect(context).toContain('sandbox')
  })

  it('stays silent outside a git repo', async () => {
    const result = runScript(await makeTempDir(), { env: UNREACHABLE_ENV })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })
})
