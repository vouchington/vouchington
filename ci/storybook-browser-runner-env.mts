import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

export function makeAttemptEnv(
  env: NodeJS.ProcessEnv,
  attempt: number,
  cwd: string,
  priorHang = false,
): NodeJS.ProcessEnv {
  let debug = removeUnboundedProtocolDebug(env.DEBUG)
  debug = appendDebugNamespace(debug, '-pw:protocol*')
  debug = appendDebugNamespace(debug, 'vitest:browser:playwright')
  debug = appendDebugNamespace(debug, 'vitest:browser:api')
  if (priorHang) {
    // Keep only bounded browser lifecycle evidence. Raw protocol traffic can exceed
    // hundreds of MiB while conveying no repository-owned semantic test progress.
    debug = appendDebugNamespace(debug, 'pw:browser*')
  }
  return {
    ...env,
    DEBUG: appendDebugNamespace(debug, 'vite:deps'),
    VITEST_COVERAGE_SCOPE: 'web-storybook-browser',
    VITEST_PW_DEBUG: '1',
    VITEST_STORYBOOK_BROWSER: '1',
    VITEST_STORYBOOK_BROWSER_API_PORT: String(storybookBrowserApiPort(env, attempt)),
    VITEST_STORYBOOK_BROWSER_CACHE_DIR: storybookBrowserAttemptCacheDir(env, attempt, cwd),
  }
}

function removeUnboundedProtocolDebug(value: string | undefined): string | undefined {
  if (!value) return value
  const namespaces = value
    .split(',')
    .map(namespace => namespace.trim())
    .filter(namespace => namespace && !/^-?pw:protocol\*?$/.test(namespace))
  return namespaces.length > 0 ? namespaces.join(',') : undefined
}

export function storybookBrowserAttemptCacheDir(
  env: NodeJS.ProcessEnv,
  attempt: number,
  cwd: string,
): string {
  if (!env.CI && !env.RUNNER_TEMP) {
    return resolve(cwd, `node_modules/.vite/storybook-browser-attempt-${attempt}`)
  }
  return resolve(
    env.RUNNER_TEMP || env.TMPDIR || tmpdir(),
    `vite-storybook-browser-attempt-${attempt}`,
  )
}

function storybookBrowserApiPort(env: NodeJS.ProcessEnv, attempt: number): number {
  const explicitPort = parsePositiveInteger(env.VITEST_STORYBOOK_BROWSER_API_PORT, 0)
  if (explicitPort) return explicitPort + (attempt - 1) * 137
  return 45_000 + ((process.pid + (attempt - 1) * 137) % 10_000)
}

function appendDebugNamespace(value: string | undefined, namespace: string): string {
  if (!value) return namespace
  return value
    .split(',')
    .map(part => part.trim())
    .includes(namespace)
    ? value
    : `${value},${namespace}`
}

export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function vitestArgs(env: NodeJS.ProcessEnv): string[] {
  const args = [
    'exec',
    './ci/with-node-test-options',
    'vitest',
    'run',
    '--bail=3',
    '--project',
    'web-storybook-browser',
  ]
  if (env.STORYBOOK_BROWSER_COVERAGE !== '0') args.push('--coverage')
  return args
}
