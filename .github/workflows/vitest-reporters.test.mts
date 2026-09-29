import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ciOutputFile, ciReporters } from '../../test-helpers/vitest-ci-reporters.mts'

const workflowDir = '.github/workflows'
const workflowFiles = readdirSync(workflowDir).filter(file => /\.(ya?ml)$/.test(file))

type WorkflowStep = {
  env?: Record<string, unknown>
  run?: string
}
type Workflow = {
  jobs?: Record<string, { steps?: WorkflowStep[] }>
}

describe('Vitest CI reporters', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses configured CI reporters for every workflow Vitest command', () => {
    const commands = workflowFiles.flatMap(file => {
      const path = join(workflowDir, file)
      const parsed = load(readFileSync(path, 'utf8')) as Workflow
      return Object.values(parsed.jobs ?? {}).flatMap(job =>
        (job.steps ?? []).flatMap(step =>
          (step.run ?? '')
            .split('\n')
            .filter(
              line =>
                line.includes('vitest run') ||
                line.includes('ci/tooling-test-runner.mts') ||
                line.includes('run-storybook-browser-tests.mts') ||
                /pnpm run test:[^\s]+/.test(line),
            )
            .map(line => ({ command: `${path}: ${line.trim()}`, env: step.env ?? {} })),
        ),
      )
    })

    expect(commands.length).toBeGreaterThan(0)

    for (const { command } of commands.filter(
      ({ command: rawCommand }) =>
        !rawCommand.includes('run-storybook-browser-tests.mts') &&
        !rawCommand.includes('--project i18n-route-bounds'),
    )) {
      expect(command).toContain('--bail=3')
    }

    const isolatedRouteBounds = commands.filter(({ command }) =>
      command.includes('--project i18n-route-bounds'),
    )
    // Route bounds stays separate from the regular tooling coverage producer.
    expect(isolatedRouteBounds.map(({ env }) => env)).toEqual([{}])

    for (const { command, env } of commands.filter(
      ({ command }) => !command.includes('--project i18n-route-bounds'),
    )) {
      expect(command).not.toContain('--reporter=')
      expect(command).not.toContain('--outputFile=')
      expect(env.VITEST_CI_REPORTERS).toBe('run')
      expect(env.VITEST_JUNIT_OUTPUT_FILE).toMatch(/\S+\.junit\.xml/)
      expect(env).not.toHaveProperty('VITEST_BLOB_OUTPUT_FILE')
    }
  })

  it('keeps annotated JUnit and diagnostic reporting without a blob collector', () => {
    vi.stubEnv('VITEST_CI_REPORTERS', 'run')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER', undefined)
    vi.stubEnv('GITHUB_REPOSITORY', 'example/repository')
    vi.stubEnv('GITHUB_SHA', 'a'.repeat(40))
    vi.stubEnv('GITHUB_WORKSPACE', '/workspace')
    const reporters = ciReporters()

    expect(reporters).toEqual(expect.arrayContaining(['minimal', 'junit', 'hanging-process']))
    expect(reporters).not.toContain('blob')
    expect(reporters).toEqual(
      expect.arrayContaining([
        [
          'github-actions',
          expect.objectContaining({
            onWritePath: expect.any(Function),
            jobSummary: {
              enabled: false,
              fileLinks: {
                repository: 'example/repository',
                commitHash: 'a'.repeat(40),
                workspacePath: '/workspace',
              },
            },
          }),
        ],
      ]),
    )
    expect(reporters).toEqual(
      expect.arrayContaining([expect.objectContaining({ onProcessTimeout: expect.any(Function) })]),
    )
    expect(reporters).toHaveLength(5)
  })

  it('adds browser progress diagnostics for Storybook runs', () => {
    vi.stubEnv('VITEST_CI_REPORTERS', 'run')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER', '1')

    expect(ciReporters()).toHaveLength(6)
  })

  it.each([undefined, ''])('leaves local reporter selection alone for %s', configured => {
    vi.stubEnv('VITEST_CI_REPORTERS', configured)

    expect(ciReporters()).toBeUndefined()
  })

  it.each(['merge', 'unknown'])('rejects unsupported reporter mode %s', configured => {
    vi.stubEnv('VITEST_CI_REPORTERS', configured)

    expect(() => ciReporters()).toThrow('Accepted value: run.')
  })

  it('routes the configured JUnit output to its reporter', () => {
    vi.stubEnv('VITEST_JUNIT_OUTPUT_FILE', 'suite.junit.xml')

    expect(ciOutputFile()).toEqual({ junit: 'suite.junit.xml' })
  })

  it('leaves output routing unset without a JUnit path', () => {
    vi.stubEnv('VITEST_JUNIT_OUTPUT_FILE', undefined)

    expect(ciOutputFile()).toBeUndefined()
  })
})
