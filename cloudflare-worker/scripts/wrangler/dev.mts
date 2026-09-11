#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getWranglerDevWorkerPort } from './dev-config.mts'
import { resolveCloudflareWorkerDir } from './env.mts'
import {
  createWranglerRuntimeEnv,
  ensureWranglerRuntimeDirs,
  getWranglerRuntimePaths,
} from './runtime.mts'

const workerDir = resolveCloudflareWorkerDir()
const userArgs = process.argv.slice(2)
const workerPort = getWranglerDevWorkerPort(userArgs, process.env.WORKER_PORT)
const runtimePaths = getWranglerRuntimePaths({
  isCi: Boolean(process.env.CI),
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '0',
  tempRoot: process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir(),
  workerDir,
  workerPort,
})

ensureWranglerRuntimeDirs(runtimePaths)

const hasPersistTo = userArgs.some(arg => arg === '--persist-to' || arg.startsWith('--persist-to='))
const args = ['dev', '--config', 'wrangler.local.jsonc', ...userArgs]
if (!hasPersistTo) {
  args.push('--persist-to', runtimePaths.persistTo)
}

const child = spawn(join(workerDir, 'node_modules', '.bin', 'wrangler'), args, {
  cwd: workerDir,
  env: createWranglerRuntimeEnv(process.env, runtimePaths),
  stdio: 'inherit',
})

child.once('error', err => {
  process.stderr.write(`dev-wrangler: failed to spawn wrangler: ${err.message}\n`)
  process.exit(1)
})

child.once('exit', (code, signal) => {
  if (signal) {
    process.stderr.write(`dev-wrangler: wrangler exited with signal ${signal}\n`)
    process.exit(1)
    return
  }
  process.exit(code ?? 1)
})
