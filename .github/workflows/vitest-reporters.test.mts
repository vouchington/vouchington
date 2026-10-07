import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ciOutputFile, ciReporters } from '../../test-helpers/vitest-ci-reporters.mts'

const workflowDir = '.github/workflows'
const workflowFiles = readdirSync(workflowDir).filter(file => /\.(ya?ml)$/.test(file))

type WorkflowStep = {
  name?: string
  env?: Record<string, unknown>
  run?: string
  if?: string
  'continue-on-error'?: boolean
  'timeout-minutes'?: number
  uses?: string
  with?: Record<string, unknown>
}
type Workflow = {
  jobs?: Record<string, { steps?: WorkflowStep[] }>
}

describe('Vitest CI reporters', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['tests-web.yml', 'web-tests', 'Run web tests', 'web-test-report-shard-${{ matrix.shard }}'],
    [
      'tests-backend-modules.yml',
      'backend-modules',
      'Run backend module tests',
      'backend-modules-junit',
    ],
    ['tests-tooling.yml', 'tooling', 'Run tooling tests', 'tooling-junit'],
    ['tests-ts-shared.yml', 'ts-shared', 'Run ts-shared tests', 'ts-shared-junit'],
  ])(
    '%s retains its existing JUnit report after completed test runs',
    (file, job, runName, name) => {
      const parsed = load(readFileSync(join(workflowDir, file), 'utf8')) as Workflow
      const steps = parsed.jobs?.[job]?.steps ?? []
      const runIndex = steps.findIndex(step => step.name === runName)
      const outputFile = steps[runIndex]?.env?.VITEST_JUNIT_OUTPUT_FILE
      const uploads = steps.filter(
        step => step.uses?.startsWith('actions/upload-artifact@') && step.with?.path === outputFile,
      )

      expect(runIndex).toBeGreaterThanOrEqual(0)
      expect(outputFile).toMatch(/\.junit\.xml$/)
      expect(uploads).toHaveLength(1)
      expect(steps.indexOf(uploads[0])).toBe(runIndex + 1)
      expect(uploads[0]).toMatchObject({
        if: '${{ !cancelled() }}',
        'continue-on-error': true,
        uses: expect.stringMatching(/^actions\/upload-artifact@[0-9a-f]{40}$/),
        with: {
          name,
          path: outputFile,
          'retention-days': 1,
          'if-no-files-found': 'warn',
        },
      })
      expect(uploads[0]?.['timeout-minutes']).toBeGreaterThan(0)
    },
  )

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
