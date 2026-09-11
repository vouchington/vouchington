import { describe, expect, it } from 'vitest'
import {
  toolingTestProjectNames,
  toolingWorkflowProjectNames,
} from '../test-helpers/vitest-config/tooling-project-registry.mts'
import {
  buildToolingVitestArgs,
  runToolingTests,
  type ToolingTestExecutor,
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
})
