import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  collectDbBackedTestSetupInput,
  evaluateDbBackedTestSetup,
} from '../dev/check-db-backed-test-setup.mts'
import { DB_ENV_NAMES, WORKTREE_RESOURCE_ENV_NAMES } from './db-env-names.mts'

export { DB_ENV_NAMES, WORKTREE_RESOURCE_ENV_NAMES }

export type CoverageEnvSuite = {
  coverageScope?: string
  requiresWebInit?: boolean
  serialExecution?: boolean
  unsetEnv?: readonly string[]
}

// Deliberately strict to "web": gates web-only coverage suites (playwright-helpers,
// web-integration) that need the full stack, unlike the DB/Valkey-backed suites below
// which accept "backend" too (see hasDataStoreInit in dev/check-db-backed-test-setup).
export function hasWebInit(cwd = '.'): boolean {
  try {
    return (
      existsSync(join(cwd, '.initialized')) &&
      readFileSync(join(cwd, '.initialized'), 'utf8').trim() === 'web' &&
      existsSync(join(cwd, '.env'))
    )
  } catch {
    return false
  }
}

export function envForSuite(
  suite: CoverageEnvSuite,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = suite.requiresWebInit
    ? { ...baseEnv }
    : envWithoutWorktreeResources(baseEnv)

  if (suite.coverageScope) env.VITEST_COVERAGE_SCOPE = suite.coverageScope
  if (suite.serialExecution) env.VITEST_MAX_WORKERS = '1'
  return env
}

export function envForCoverageRun(
  suite: CoverageEnvSuite,
  cwd: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = suite.requiresWebInit
    ? envForDbBackedSuite(cwd, baseEnv)
    : envForSuite(suite, baseEnv)
  if (suite.coverageScope) env.VITEST_COVERAGE_SCOPE = suite.coverageScope
  if (suite.serialExecution) env.VITEST_MAX_WORKERS = '1'
  const unsetEnv = new Set(suite.unsetEnv)
  return Object.fromEntries(Object.entries(env).filter(([name]) => !unsetEnv.has(name)))
}

export function envForDbBackedSuite(cwd: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return validatedCurrentWorktreeEnv(cwd, baseEnv, 'coverage')
}

function validatedCurrentWorktreeEnv(
  cwd: string,
  baseEnv: NodeJS.ProcessEnv,
  purpose: 'coverage' | 'tooling test',
): NodeJS.ProcessEnv {
  const env = loadCurrentWorktreeEnv(cwd, baseEnv)
  const setup = collectDbBackedTestSetupInput(cwd, env, { probeServices: false })
  const validation = evaluateDbBackedTestSetup(setup)
  if (!validation.ok) {
    const errors =
      purpose === 'tooling test'
        ? validation.errors.map(toolingSetupErrorWithoutShellSourcing)
        : validation.errors
    throw new Error([`DB/Valkey-backed ${purpose} setup is not ready.`, ...errors].join('\n'))
  }

  return env
}

function toolingSetupErrorWithoutShellSourcing(error: string): string {
  const hintStart = error.indexOf(' Run ./dev/initialize backend (or web)')
  if (hintStart === -1) return error
  return `${error.slice(0, hintStart)} Run ./dev/initialize backend (or web) before rerunning tooling tests.`
}

export function envWithoutWorktreeResources(
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(baseEnv).filter(([name]) => !WORKTREE_RESOURCE_ENV_NAMES.has(name)),
  )
  env.BASH_ENV = '/dev/null'
  return env
}

export function envForDbBackedToolingProject(
  cwd: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return validatedCurrentWorktreeEnv(cwd, baseEnv, 'tooling test')
}

// Mutates `targetEnv` (default `process.env`) instead of replacing it: Vitest's `vi.stubEnv` and
// `vi.unstubAllEnvs` unset variables with `delete` on the original `process.env` object, so a
// reassigned `process.env` silently leaks stubbed variables between tests. An `undefined` value in
// `nextEnv` means unset, because the real `process.env` would store it as the string "undefined".
export function replaceEnvInPlace(
  nextEnv: NodeJS.ProcessEnv,
  targetEnv: NodeJS.ProcessEnv = process.env,
): void {
  for (const name of Object.keys(targetEnv)) {
    if (nextEnv[name] === undefined) Reflect.deleteProperty(targetEnv, name)
  }
  for (const [name, value] of Object.entries(nextEnv)) {
    if (value !== undefined) targetEnv[name] = value
  }
}

export function loadCurrentWorktreeEnv(cwd: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const envFile = join(cwd, '.env')
  if (!existsSync(envFile)) {
    return { ...baseEnv }
  }

  const sourceEnv = envWithoutWorktreeResources(baseEnv)
  try {
    const stdout = execFileSync('bash', ['-c', 'set -a; source "$1" && env -0', '--', envFile], {
      cwd,
      encoding: 'utf8',
      env: sourceEnv,
      maxBuffer: 1 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return withBaseNodeEnv(parseNullDelimitedEnv(stdout), baseEnv)
  } catch (error) {
    if (!isMissingBashError(error)) throw error
    return withBaseNodeEnv(parseEnvFileText(readFileSync(envFile, 'utf8'), sourceEnv), baseEnv)
  }
}

function withBaseNodeEnv(env: NodeJS.ProcessEnv, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (baseEnv.NODE_ENV !== undefined) env.NODE_ENV = baseEnv.NODE_ENV
  return env
}

function isMissingBashError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function parseNullDelimitedEnv(raw: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const entry of raw.split('\0')) {
    if (!entry) continue
    const equalsIndex = entry.indexOf('=')
    if (equalsIndex === -1) continue
    env[entry.slice(0, equalsIndex)] = entry.slice(equalsIndex + 1)
  }
  return env
}

function parseEnvFileText(raw: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...baseEnv }
  // Fallback only covers simple KEY=value files; shell expansions intentionally require bash.
  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_]\w*)=(.*)$/)
    if (!match) continue
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return env
}
