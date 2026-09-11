import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { VITEST_OWNERSHIP } from '../../ci/vitest/project-ownership.mts'
import { vitestArgs } from '../../ci/storybook-browser-runner-env.mts'
import { shellLogicalLines } from './workflow-test-helpers.mts'

// Validates the model in ci/vitest/project-ownership.mts against the real `--project` commands in
// .github/workflows/tests-*.yml / storybook.yml, across all four invocation forms. See
// project-ownership.mts's header for the three surfaces this keeps in parity.

function workflowFile(name: string): string {
  return readFileSync(`.github/workflows/${name}`, 'utf8')
}

// Extracts every `--project <name>` token from physical lines that actually invoke `vitest run` —
// deliberately excludes `tsc --noEmit --project <path>/tsconfig.json` steps (present in
// tests-lambdas.yml, tests-backend-modules.yml, tests-cloudflare-worker.yml), which share the
// `--project` flag name but are a different tool's step entirely.
function literalProjectsInvokedBy(workflowFileName: string): Set<string> {
  const projects = new Set<string>()
  for (const line of shellLogicalLines(workflowFile(workflowFileName))) {
    if (!line.includes('vitest run')) continue
    for (const match of line.matchAll(/--project[ =]([^\s]+)/g)) projects.add(match[1])
  }
  return projects
}

function modelProjectNames(job: (typeof VITEST_OWNERSHIP)[number]): Set<string> {
  return new Set(job.projects.map(project => project.project))
}

function requireJob(
  invocation: (typeof VITEST_OWNERSHIP)[number]['invocation'],
): (typeof VITEST_OWNERSHIP)[number] {
  const job = VITEST_OWNERSHIP.find(candidate => candidate.invocation === invocation)
  if (!job) throw new Error(`No job with invocation "${invocation}" is registered`)
  return job
}

describe('Vitest project ownership <-> workflow --project commands', () => {
  const literalJobs = VITEST_OWNERSHIP.filter(job => job.invocation === 'literal')

  it.each(literalJobs.map(job => [job.orchestratorJob, job] as const))(
    '%s: workflow --project tokens match the model exactly',
    (_orchestratorJob, job) => {
      const actual = [...literalProjectsInvokedBy(job.workflow)].sort()
      expect(actual).toEqual([...modelProjectNames(job)].sort())
    },
  )

  it("storybook: literal --project tokens match the model's non-browser-runner projects", () => {
    const job = requireJob('storybook')
    const literalProjects = new Set(
      job.projects.filter(project => !project.browserRunner).map(project => project.project),
    )
    const actual = [...literalProjectsInvokedBy(job.workflow)].sort()
    expect(actual).toEqual([...literalProjects].sort())
  })

  it('storybook: the browser-runner project is assembled at runtime, never literal workflow text', () => {
    const job = requireJob('storybook')
    const browserProject = job.projects.find(project => project.browserRunner)
    expect(browserProject).toBeDefined()

    // Resolved through the script that actually assembles its vitest invocation, since it never
    // appears as literal `--project` text in the workflow YAML — see storybook-browser-runner-env.mts.
    expect(vitestArgs({})).toEqual(expect.arrayContaining(['--project', browserProject?.project]))
    expect(workflowFile(job.workflow)).not.toContain(`--project ${browserProject?.project}`)
    expect(workflowFile(job.workflow)).toContain('run-storybook-browser-tests.mts')
  })

  it('tooling: routes through the central registry, not a literal --project list', () => {
    const job = requireJob('tooling-registry')
    expect(workflowFile(job.workflow)).toContain('tooling-test-runner.mts --workflow-projects')
    expect(literalProjectsInvokedBy(job.workflow).size).toBe(0)
    expect(job.projects.length).toBeGreaterThan(0)
  })

  it('portability: routes through the central group runner, not a literal --project list', () => {
    const job = requireJob('portability-group')
    expect(workflowFile(job.workflow)).toContain('pnpm run test:portability')
    expect(literalProjectsInvokedBy(job.workflow).size).toBe(0)
    expect(job.projects.length).toBeGreaterThan(0)
  })

  it('has exactly one job per invocation form covered above, plus the literal jobs', () => {
    const nonLiteralForms = new Set(
      VITEST_OWNERSHIP.filter(job => job.invocation !== 'literal').map(job => job.invocation),
    )
    expect(nonLiteralForms).toEqual(new Set(['storybook', 'tooling-registry', 'portability-group']))
  })
})
