import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'
import {
  toolingTestProjectNames,
  toolingWorkflowProjectNames,
} from '../test-helpers/vitest-config/tooling-project-registry.mts'
import { TOOLING_HANG_GRACE_MS } from './tooling-test-hang-watchdog.mts'
import {
  buildToolingVitestArgs,
  runToolingTests,
  runToolingTestsWatched,
  toolingCoverageEnabled,
  type ToolingTestExecutor,
  type ToolingWatchedRunDeps,
} from './tooling-test-runner.mts'

describe('tooling test runner', () => {
  it('builds one Vitest invocation from the central project registry', () => {
    expect(buildToolingVitestArgs(['--', '--bail=3', '--coverage'])).toEqual([
      'vitest',
      'run',
      ...toolingTestProjectNames.flatMap(project => ['--project', project]),
      '--bail=3',
      '--coverage',
    ])
  })

  it('keeps separately owned portability tests out of the tooling workflow', () => {
    expect(buildToolingVitestArgs(['--workflow-projects', '--coverage'])).toEqual([
      'vitest',
      'run',
      ...toolingWorkflowProjectNames.flatMap(project => ['--project', project]),
      '--coverage',
    ])
    expect(toolingWorkflowProjectNames).toContain('static-analysis-ast-grep')
  })

  it.each([['--project', 'dev-tools'], ['--project=dev-tools']])(
    'rejects caller-owned project selection: %s',
    (...args) => {
      expect(() => buildToolingVitestArgs(args)).toThrow(
        'test:tooling owns project selection through the central registry',
      )
    },
  )

  it.each([
    { code: 17, signal: null },
    { code: null, signal: 'SIGTERM' as const },
  ])('sets tooling coverage scope and preserves executor completion: $signal', result => {
    let invocation: { command: string; args: string[]; env: NodeJS.ProcessEnv } | undefined
    const execute: ToolingTestExecutor = (command, args, env) => {
      invocation = { command, args, env }
      return result
    }

    expect(runToolingTests(['--bail=3'], execute, { KEEP_ME: 'yes' })).toEqual(result)
    expect(invocation).toEqual({
      command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      args: ['exec', './ci/with-node-test-options', ...buildToolingVitestArgs(['--bail=3'])],
      env: { KEEP_ME: 'yes', VITEST_COVERAGE_SCOPE: 'tooling' },
    })
  })

  it.each(['--coverage', '--coverage=true'])(
    'treats %s as coverage-enabled for the hang watchdog',
    flag => {
      expect(toolingCoverageEnabled(['exec', flag], {})).toBe(true)
    },
  )

  it('SIGKILLs after a terminate-worker marker split around stdout', async () => {
    let now = 0
    const child = Object.assign(new EventEmitter(), {
      pid: 42,
      stderr: new EventEmitter(),
      stdout: new EventEmitter(),
    })
    let interval: (() => void) | undefined
    const killed: Array<{ pid: number; signal: NodeJS.Signals }> = []
    const deps: ToolingWatchedRunDeps = {
      spawn: (() => child) as unknown as ToolingWatchedRunDeps['spawn'],
      now: () => now,
      setInterval: callback => {
        interval = callback
        return 1
      },
      clearInterval: () => {
        interval = undefined
      },
      killProcessGroup: (pid, signal) => {
        killed.push({ pid, signal })
        child.emit('close', null, signal)
      },
      onParentSignal: () => {},
      offParentSignal: () => {},
      stderr: { write: () => true },
      stdout: { write: () => true },
    }

    const run = runToolingTestsWatched([], {}, deps)
    child.stderr.emit('data', 'Timeout terminating ')
    child.stdout.emit('data', 'progress\n')
    child.stderr.emit('data', 'forks worker\n')
    now = TOOLING_HANG_GRACE_MS
    interval?.()
    expect(killed).toEqual([{ pid: 42, signal: 'SIGKILL' }])
    await expect(run).resolves.toEqual({ code: null, signal: 'SIGKILL' })
  })
})
