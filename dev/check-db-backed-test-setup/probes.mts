import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  CollectDbBackedTestSetupOptions,
  DbBackedTestSetupInput,
  ProbeStatus,
} from './types.mts'
import { commandErrorMessage } from './command-error.mts'
import { gitEnvWithoutWorktreeOverrides } from './git-env.mts'
import { readWorktreeResourceIdentity } from './identity.mts'
import { probeKnownSchemaDrift } from './schema-probe.mts'

const valkeyUrlEnvNames = [
  'VALKEY_URL',
  'VALKEY_SESSION_URL',
  'VALKEY_CACHE_URL',
  'VALKEY_RATE_LIMITER_URL',
  'VALKEY_DYNAMIC_CONFIG_URL',
  'VALKEY_WORKER_QUEUE_URL',
] as const

export function hasValkeyConfiguration(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VALKEY_CONTAINER || firstValkeyUrl(env))
}

// DB/Valkey-backed tests need only the datastore rung of the initialization ladder —
// "backend" or "web" — not the full web stack.
export function hasDataStoreInit(mode: string | null | undefined): boolean {
  return mode === 'backend' || mode === 'web'
}

export function firstValkeyUrl(env: NodeJS.ProcessEnv): string | undefined {
  for (const name of valkeyUrlEnvNames) {
    const value = env[name]
    if (value) {
      return value
    }
  }

  return undefined
}

export function collectDbBackedTestSetupInput(
  cwd = process.cwd(),
  env = process.env,
  options: CollectDbBackedTestSetupOptions = {},
): DbBackedTestSetupInput {
  const gitTopLevel = readGitTopLevel(cwd)
  const repoRoot = gitTopLevel ?? cwd
  const initializedPath = resolve(repoRoot, '.initialized')
  const envPath = resolve(repoRoot, '.env')
  const files = {
    env: existsSync(envPath),
    initialized: existsSync(initializedPath),
  }
  const initializedMode = files.initialized
    ? readFileSync(initializedPath, 'utf8').trim() || null
    : null
  let identity = { isMainWorktree: false, worktreeDir: '' }
  let identityProbe: ProbeStatus = { checked: true, ok: true }
  try {
    identity = readWorktreeResourceIdentity(repoRoot, env)
  } catch (err) {
    identityProbe = {
      checked: true,
      message: commandErrorMessage(err),
      ok: false,
    }
  }

  const input: DbBackedTestSetupInput = {
    cwd,
    env,
    files,
    gitTopLevel,
    identityProbe,
    initializedMode,
    isMainWorktree: identity.isMainWorktree,
    worktreeDir: identity.worktreeDir,
  }

  if (!identityProbe.ok) {
    return input
  }

  if (
    options.probeServices !== false &&
    !env.CI &&
    files.env &&
    hasDataStoreInit(initializedMode) &&
    env.DATABASE_URL
  ) {
    input.databaseProbe = probePostgres(env.DATABASE_URL, cwd)
    if (input.databaseProbe.ok) {
      input.schemaProbe = probeKnownSchemaDrift(env.DATABASE_URL, cwd)
    }
  }

  if (
    options.probeServices !== false &&
    !env.CI &&
    files.env &&
    hasDataStoreInit(initializedMode) &&
    hasValkeyConfiguration(env)
  ) {
    input.valkeyProbe = probeValkey(env, cwd)
  }

  return input
}

function readGitTopLevel(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      env: gitEnvWithoutWorktreeOverrides(),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function probePostgres(databaseUrl: string, cwd: string): ProbeStatus {
  try {
    execFileSync('psql', [databaseUrl, '-Atqc', 'select 1'], {
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 5_000,
    })
    return { checked: true, ok: true }
  } catch (err) {
    return {
      checked: true,
      message: commandErrorMessage(err),
      ok: false,
    }
  }
}

function probeValkey(env: NodeJS.ProcessEnv, cwd: string): ProbeStatus {
  if (env.VALKEY_CONTAINER) {
    return probeValkeyContainer(env.VALKEY_CONTAINER, cwd)
  }

  const valkeyUrl = firstValkeyUrl(env)
  if (!valkeyUrl) {
    return { checked: false, ok: true }
  }

  try {
    execFileSync('valkey-cli', ['-u', valkeyUrl, 'PING'], {
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 5_000,
    })
    return { checked: true, ok: true }
  } catch (err) {
    return {
      checked: true,
      message: commandErrorMessage(err),
      ok: false,
    }
  }
}

function probeValkeyContainer(containerName: string, cwd: string): ProbeStatus {
  try {
    execFileSync('docker', ['exec', containerName, 'valkey-cli', 'PING'], {
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 5_000,
    })
    return { checked: true, ok: true }
  } catch (err) {
    return {
      checked: true,
      message: commandErrorMessage(err),
      ok: false,
    }
  }
}
