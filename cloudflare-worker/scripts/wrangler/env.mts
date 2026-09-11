import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildWranglerArgs } from './config.mts'
import { readPackageVersion } from './logging.mts'
import { createWranglerRuntimeEnv, getWranglerRuntimePaths } from './runtime.mts'

export function resolveCloudflareWorkerDir(scriptDir = import.meta.dirname) {
  return resolve(scriptDir, '..', '..')
}

export function hasWranglerHttpsCerts(
  certPath: string,
  keyPath: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    env.WRANGLER_LOCAL_PROTOCOL !== 'http' &&
    env.WRANGLER_FORCE_HTTP !== '1' &&
    existsSync(certPath) &&
    existsSync(keyPath)
  )
}

export function loadStartWranglerEnv(
  env: NodeJS.ProcessEnv = process.env,
  scriptDir = import.meta.dirname,
) {
  const workerPort = requireEnv('WORKER_PORT', env)
  const isCi = Boolean(env.CI)
  const inspectorPort = readInspectorPort(isCi, env)
  const workerDir = resolveCloudflareWorkerDir(scriptDir)
  const repoRoot = resolve(workerDir, '..')

  const bundlePath = join(workerDir, 'dist', 'index.js')
  if (!existsSync(bundlePath)) {
    process.stderr.write(
      `[start-wrangler] Error: ${bundlePath} not found.\n` +
        'Build the worker first: pnpm --dir cloudflare-worker build\n' +
        'Or run the full test setup: pnpm run test:playwright\n',
    )
    process.exit(1)
  }
  const certPath = join(repoRoot, 'dev', 'certs', 'localhost.pem')
  const keyPath = join(repoRoot, 'dev', 'certs', 'localhost-key.pem')
  const hasCerts = hasWranglerHttpsCerts(certPath, keyPath, env)
  const runAttempt = env.GITHUB_RUN_ATTEMPT ?? '0'
  const runtimePaths = getWranglerRuntimePaths({
    isCi,
    runAttempt,
    tempRoot: env.RUNNER_TEMP || env.TMPDIR || tmpdir(),
    workerDir,
    workerPort,
  })
  const wranglerArgs = buildWranglerArgs({
    certPath,
    hasCerts,
    inspectorPort,
    isCi,
    keyPath,
    logLevelOverride: env.WRANGLER_LOG_LEVEL,
    persistTo: runtimePaths.persistTo,
    workerPort,
  })
  return {
    hasCerts,
    inspectorPort,
    isCi,
    workerDir,
    workerLogDir: env.WORKER_LOG_DIR,
    workerPort,
    wranglerEnv: createWranglerRuntimeEnv(env, runtimePaths),
    workerdVersion: readPackageVersion(join(workerDir, 'node_modules', 'workerd', 'package.json')),
    wranglerRuntimePaths: runtimePaths,
    wranglerArgs,
    wranglerBin: join(workerDir, 'node_modules', '.bin', 'wrangler'),
    wranglerVersion: readPackageVersion(
      join(workerDir, 'node_modules', 'wrangler', 'package.json'),
    ),
  }
}

function requireEnv(name: 'WORKER_PORT', env: NodeJS.ProcessEnv = process.env) {
  const value = env[name]
  if (!value) {
    process.stderr.write(`start-wrangler: ${name} is required\n`)
    process.exit(1)
  }
  return value
}

export function readInspectorPort(isCi: boolean, env: NodeJS.ProcessEnv = process.env): string {
  const value = env.INSPECTOR_PORT
  if (value) return value
  if (isCi) return '0'
  process.stderr.write('start-wrangler: INSPECTOR_PORT is required\n')
  process.exit(1)
  throw new Error('unreachable: process.exit returned')
}
