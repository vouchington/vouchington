import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import vitestConfig from '../../vitest.config.mts'
import { parseGithubOutput } from '../../test-helpers/github-output.mts'
import type { PlannedTests } from '../test-plan.mts'

import {
  allJobs,
  buildFileGroupTypes,
  groupCount,
  isWarmJob,
  PROJECT_TO_JOB,
  planCommentSummary,
  PLAN_COMMENT_SUMMARY_MAX_BYTES,
  resolveJobSelection,
  runVitestCiSelect,
  vitestPlanOptions,
} from './ci-select.mts'

function realVitestProjectNames(): string[] {
  const projects = (vitestConfig.test?.projects ?? []) as { test?: { name?: string } }[]
  return projects
    .map(project => project.test?.name)
    .filter((name): name is string => typeof name === 'string')
}

function plannedTests(overrides: Partial<PlannedTests> = {}): PlannedTests {
  return {
    changedFiles: [],
    comment: '',
    fallbackReason: null,
    fallbackTriggered: false,
    files: [],
    groups: [],
    json: {} as PlannedTests['json'],
    targets: [],
    threshold: 0,
    total: 0,
    warnings: [],
    ...overrides,
  }
}

async function runSelection(runPlanner: typeof import('../test-plan.mts').planTests) {
  const dir = await mkdtemp(join(tmpdir(), 'vitest-ci-select-'))
  const outputPath = join(dir, 'output')
  const summaryPath = join(dir, 'summary')
  const savedEnv = {
    EVENT_NAME: process.env['EVENT_NAME'],
    GITHUB_BASE_REF: process.env['GITHUB_BASE_REF'],
    GITHUB_OUTPUT: process.env['GITHUB_OUTPUT'],
    GITHUB_STEP_SUMMARY: process.env['GITHUB_STEP_SUMMARY'],
  }
  Object.assign(process.env, {
    EVENT_NAME: 'pull_request',
    GITHUB_BASE_REF: 'main',
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
  })
  try {
    await runVitestCiSelect(runPlanner, dir)
    return {
      artifacts: {
        json: await readFile(join(dir, 'vitest-test-plan.json'), 'utf8'),
        markdown: await readFile(join(dir, 'vitest-test-plan.md'), 'utf8'),
      },
      output: parseGithubOutput(await readFile(outputPath, 'utf8')),
    }
  } finally {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(dir, { force: true, recursive: true })
  }
}

describe('PROJECT_TO_JOB totality', () => {
  it('routes every real Vitest project to exactly one CI job', () => {
    const realNames = realVitestProjectNames()

    const missing = realNames.filter(name => !Object.hasOwn(PROJECT_TO_JOB, name))
    expect(missing).toEqual([])
  })

  it('has no stale entries for projects that no longer exist', () => {
    const realNames = new Set(realVitestProjectNames())
    const stale = Object.keys(PROJECT_TO_JOB).filter(name => !realNames.has(name))
    expect(stale).toEqual([])
  })

  it('maps every job to a non-empty set of projects', () => {
    for (const job of allJobs()) {
      const projectsForJob = Object.entries(PROJECT_TO_JOB).filter(([, j]) => j === job)
      expect(projectsForJob.length).toBeGreaterThan(0)
    }
  })
})

describe('no-mistakes CI Vitest planner', () => {
  it('passes the PR base and HEAD to the revision-aware planner', () => {
    const options = vitestPlanOptions(process.cwd(), 'release/2026-07')

    expect(options.timeout).toBe(0)
    expect(options.lockTimeout).toBe(0)
    expect(options.base).toBe('origin/release/2026-07')
    expect(options.head).toBe('HEAD')
    expect(options).not.toHaveProperty('diff')
    expect(options).not.toHaveProperty('changedFiles')
    expect(options).not.toHaveProperty('tsconfig')
  })

  it('fails open when the injected planner fails', async () => {
    const { artifacts, output } = await runSelection(async () => {
      throw new Error('planner unavailable')
    })

    expect(output).toMatchObject({
      'full-suite': 'true',
      reason: 'test planner failed',
      'full-storybook': 'true',
    })
    expect(output).not.toHaveProperty('skip-test-tooling')
    expect(output['full-test-tooling']).toBe('true')
    expect(output['run-tests-test-tooling']).toBe('true')
    expect(output['files-test-tooling']).toBe('')
    expect(output).toMatchObject({
      'full-test-web-api': 'true',
      'full-test-web-integration': 'true',
      'shard-total-test-web-integration': '1',
    })
    expect(output).not.toHaveProperty('shard-total-test-web-api')
    expect(artifacts.json).toContain('"mode": "full"')
    expect(artifacts.markdown).toContain('Full suite: no-mistakes test planner failed')
  })

  it('writes selected files and runs only their owning job', async () => {
    const { output } = await runSelection(async () =>
      plannedTests({
        files: ['dev/future-tooling-helper.test.mts'],
        groups: [
          { remaining: 0, selected: ['dev/future-tooling-helper.test.mts'], type: 'direct' },
        ],
        targets: [
          {
            baseCommand: [],
            config: null,
            project: 'dev-tools',
            runner: 'vitest',
            runnerArgs: [],
            testFiles: ['dev/future-tooling-helper.test.mts'],
          },
        ],
        total: 1,
      }),
    )

    expect(output['full-suite']).toBe('false')
    expect(output['run-tests-test-tooling']).toBe('true')
    expect(output['files-test-tooling']).toBe('dev/future-tooling-helper.test.mts')
    expect(output['run-tests-test-backend-modules']).toBe('false')
    expect(output).toHaveProperty('skip-test-backend-modules')
  })

  it('does not emit a Storybook skip output for an empty selection', async () => {
    const { output } = await runSelection(async () => plannedTests())

    expect(output).not.toHaveProperty('skip-storybook')
    expect(output['storybook-browser-mode']).toBe('empty')
  })

  it('keeps web API and web-integration selected-file outputs independent', async () => {
    const { output } = await runSelection(async () =>
      plannedTests({
        files: ['integration-tests/web-api/api.test.mts'],
        groups: [
          { remaining: 0, selected: ['integration-tests/web-api/api.test.mts'], type: 'direct' },
        ],
        targets: [
          {
            baseCommand: [],
            config: null,
            project: 'web-api',
            runner: 'vitest',
            runnerArgs: [],
            testFiles: ['integration-tests/web-api/api.test.mts'],
          },
        ],
        total: 1,
      }),
    )

    expect(output).toMatchObject({
      'files-test-web-api': 'integration-tests/web-api/api.test.mts',
      'run-tests-test-web-api': 'true',
      'shard-total-test-web-api': '1',
      'files-test-web-integration': '',
      'run-tests-test-web-integration': 'false',
      'shard-total-test-web-integration': '1',
      'skip-test-web-integration': 'true',
    })
  })
})

describe('groupCount', () => {
  it('returns the selected count for the matching group', () => {
    expect(
      groupCount(
        [
          { type: 'direct', selected: ['web/foo.test.tsx'] },
          { type: 'sample', selected: ['web/bar.test.tsx', 'web/baz.test.tsx'] },
        ],
        'sample',
      ),
    ).toBe(2)
  })

  it('returns zero when the group is absent', () => {
    expect(groupCount([{ type: 'direct', selected: ['web/a.test.tsx'] }], 'dependencies')).toBe(0)
  })
})

describe('resolveJobSelection', () => {
  it('keeps a small selected list when the job is not forced full', () => {
    expect(resolveJobSelection('test-backend-unit', ['a.test.mts'], false)).toEqual({
      fullJob: false,
      selectedFiles: ['a.test.mts'],
      reason: 'selected',
    })
  })

  it('clears files when the job is already forced full', () => {
    expect(resolveJobSelection('test-backend-unit', ['a.test.mts'], true)).toEqual({
      fullJob: true,
      selectedFiles: [],
      reason: 'forced-full',
    })
  })

  it('promotes when selected files are strictly greater than half the job suite', () => {
    const files = Array.from({ length: 1076 }, (_, index) => `backend/f-${index}.test.mts`)
    expect(resolveJobSelection('test-backend-unit', files, false, 2151)).toEqual({
      fullJob: true,
      selectedFiles: [],
      reason: 'suite-fraction',
    })
  })

  it('keeps an exact 50% selection when it also fits the env budget', () => {
    const files = Array.from({ length: 1075 }, (_, index) => `b-${index}.test.mts`)
    expect(resolveJobSelection('test-backend-unit', files, false, 2150)).toEqual({
      fullJob: false,
      selectedFiles: files,
      reason: 'selected',
    })
  })
})

describe('planCommentSummary', () => {
  it('wraps short comments and omits oversized planner text', () => {
    expect(planCommentSummary('hello')).toMatch(/<details>[\s\S]*hello/)
    const summary = planCommentSummary('x'.repeat(PLAN_COMMENT_SUMMARY_MAX_BYTES + 1))
    expect(summary).not.toContain('<details>')
    expect(summary).toContain('Planner explanation omitted')
    expect(summary).toContain('vitest-test-plan.md')
  })
})

describe('buildFileGroupTypes + isWarmJob', () => {
  it('prefers the non-sample designation when a file appears in multiple groups', () => {
    const types = buildFileGroupTypes([
      { type: 'sample', selected: ['a.test.mts'] },
      { type: 'direct', selected: ['a.test.mts'] },
    ])
    expect(types.get('a.test.mts')).toBe('direct')
  })

  it('treats a job as cold when every file is sample-only', () => {
    const types = buildFileGroupTypes([{ type: 'sample', selected: ['a.test.mts', 'b.test.mts'] }])
    expect(isWarmJob(['a.test.mts', 'b.test.mts'], types)).toBe(false)
  })

  it('treats a job as warm when at least one file is direct or dependency-related', () => {
    const types = buildFileGroupTypes([
      { type: 'sample', selected: ['a.test.mts'] },
      { type: 'dependencies', selected: ['b.test.mts'] },
    ])
    expect(isWarmJob(['a.test.mts', 'b.test.mts'], types)).toBe(true)
  })
})
