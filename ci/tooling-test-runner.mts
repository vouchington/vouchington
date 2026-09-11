#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  toolingTestProjectNames,
  toolingWorkflowProjectNames,
} from '../test-helpers/vitest-config/tooling-project-registry.mts'
import { propagateVitestChildCompletion } from './run-vitest-project-group.mts'

export type ToolingTestExecutor = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => ToolingTestResult

export type ToolingTestResult = {
  code: number | null
  signal: NodeJS.Signals | null
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

const executeToolingVitest: ToolingTestExecutor = (command, args, env) => {
  const result = spawnSync(command, args, { env, stdio: 'inherit' })
  if (result.error) throw result.error
  return { code: result.status, signal: result.signal }
}

export function runToolingTests(
  args: string[],
  execute: ToolingTestExecutor = executeToolingVitest,
  baseEnv: NodeJS.ProcessEnv = process.env,
): ToolingTestResult {
  return execute(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', './ci/with-node-test-options', ...buildToolingVitestArgs(args)],
    {
      ...baseEnv,
      VITEST_COVERAGE_SCOPE: 'tooling',
    },
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  propagateVitestChildCompletion(runToolingTests(process.argv.slice(2)))
}
