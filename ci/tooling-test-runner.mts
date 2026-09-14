#!/usr/bin/env node

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  toolingTestProjectNames,
  toolingWorkflowProjectNames,
} from '../test-helpers/vitest-config/tooling-project-registry.mts'
import { propagateVitestChildCompletion } from './run-vitest-project-group.mts'
import {
  startToolingHangWatchdog,
  type ToolingHangWatchdogDeps,
} from './tooling-test-hang-watchdog.mts'

export type ToolingTestExecutor = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => ToolingTestResult

export type ToolingTestResult = {
  code: number | null
  signal: NodeJS.Signals | null
}

export type ToolingWatchedRunDeps = Pick<
  ToolingHangWatchdogDeps,
  'clearInterval' | 'killProcessGroup' | 'now' | 'setInterval' | 'stderr'
> & {
  offParentSignal: (signal: NodeJS.Signals, listener: () => void) => void
  onParentSignal: (signal: NodeJS.Signals, listener: () => void) => void
  spawn: typeof spawn
  stdout: Pick<NodeJS.WriteStream, 'write'>
}

export function buildToolingVitestArgs(args: string[]): string[] {
  const forwardedArgs = args[0] === '--' ? args.slice(1) : args
  if (forwardedArgs.some(arg => arg === '--project' || arg.startsWith('--project='))) {
    throw new Error('test:tooling owns project selection through the central registry')
  }
  const workflowProjects = forwardedArgs.includes('--workflow-projects')
  const vitestArgs = forwardedArgs.filter(arg => arg !== '--workflow-projects')
  const projects = workflowProjects ? toolingWorkflowProjectNames : toolingTestProjectNames

  return ['vitest', 'run', ...projects.flatMap(project => ['--project', project]), ...vitestArgs]
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  // eslint-disable-next-line no-restricted-properties -- process-group SIGKILL is the hang watchdog
  process.kill(-pid, signal)
}

const executeToolingVitest: ToolingTestExecutor = (command, args, env) => {
  const result = spawnSync(command, args, { env, stdio: 'inherit' })
  if (result.error) throw result.error
  return { code: result.status, signal: result.signal }
}

export function toolingCoverageEnabled(args: readonly string[], env: NodeJS.ProcessEnv): boolean {
  return (
    args.some(argument => argument === '--coverage' || argument === '--coverage=true') ||
    env.VITEST_COVERAGE_ENABLED === 'true'
  )
}

export function toolingTestCommand(
  args: string[],
  baseEnv: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['exec', './ci/with-node-test-options', ...buildToolingVitestArgs(args)],
    env: {
      ...baseEnv,
      VITEST_COVERAGE_SCOPE: 'tooling',
    },
  }
}

export function runToolingTests(
  args: string[],
  execute: ToolingTestExecutor = executeToolingVitest,
  baseEnv: NodeJS.ProcessEnv = process.env,
): ToolingTestResult {
  const invocation = toolingTestCommand(args, baseEnv)
  return execute(invocation.command, invocation.args, invocation.env)
}

function tee(stream: NodeJS.ReadableStream | null, write: (chunk: string) => boolean): void {
  stream?.on('data', chunk => {
    write(String(chunk))
  })
}

export async function runToolingTestsWatched(
  args: string[],
  baseEnv: NodeJS.ProcessEnv = process.env,
  deps: ToolingWatchedRunDeps = {
    spawn,
    now: () => Date.now(),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: handle => clearInterval(handle as NodeJS.Timeout),
    killProcessGroup,
    onParentSignal: (signal, listener) => process.on(signal, listener),
    offParentSignal: (signal, listener) => process.off(signal, listener),
    stderr: process.stderr,
    stdout: process.stdout,
  },
): Promise<ToolingTestResult> {
  const invocation = toolingTestCommand(args, baseEnv)
  const child: ChildProcess = deps.spawn(invocation.command, invocation.args, {
    env: invocation.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const pid = child.pid
  if (pid === undefined) throw new Error('tooling Vitest spawn produced no pid')
  const watchdog = startToolingHangWatchdog(pid, deps, {
    coverageEnabled: toolingCoverageEnabled(invocation.args, invocation.env),
    wallClock: invocation.env.CI === 'true' || invocation.env.GITHUB_ACTIONS === 'true',
  })
  const onStop = () => deps.killProcessGroup(pid, 'SIGTERM')
  deps.onParentSignal('SIGINT', onStop)
  deps.onParentSignal('SIGTERM', onStop)
  tee(child.stdout, chunk => {
    watchdog.onOutput(chunk, 'stdout')
    return deps.stdout.write(chunk)
  })
  tee(child.stderr, chunk => {
    watchdog.onOutput(chunk, 'stderr')
    return deps.stderr.write(chunk)
  })
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
  } finally {
    deps.offParentSignal('SIGINT', onStop)
    deps.offParentSignal('SIGTERM', onStop)
    watchdog.stop()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runToolingTestsWatched(process.argv.slice(2))
    .then(propagateVitestChildCompletion)
    .catch(error => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
