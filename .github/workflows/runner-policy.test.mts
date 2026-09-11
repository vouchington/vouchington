import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { assertNoWorkflowViolations } from './workflow-test-helpers.mts'

type Workflow = {
  jobs?: Record<
    string,
    {
      'runs-on'?: string | string[]
      uses?: string
      with?: Record<string, unknown>
      steps?: Array<{
        run?: string
        uses?: string
      }>
    }
  >
}

const workflowPaths = readdirSync('.github/workflows').flatMap(path =>
  path.endsWith('.yml') || path.endsWith('.yaml') ? [`.github/workflows/${path}`] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('workflow runner policy', () => {
  it('pins broad portable test jobs to deterministic Linux test runners', () => {
    const portableTestJobs = [
      ['.github/workflows/tests-tooling.yml', 'tooling'],
      ['.github/workflows/tests-lambdas.yml', 'lambdas-tests'],
      ['.github/workflows/tests-cloudflare-worker.yml', 'cloudflare-worker-tests'],
      ['.github/workflows/tests-ts-shared.yml', 'ts-shared'],
    ] as const
    for (const [path, job] of portableTestJobs) {
      expect(readWorkflow(path).jobs?.[job]?.['runs-on']).toEqual([
        'self-hosted',
        'Linux',
        'Docker',
        'Tests',
      ])
    }
  })

  it('pins focused portability jobs to one audited runner per operating system', () => {
    const jobs = readWorkflow('.github/workflows/tests-portability.yml').jobs
    expect(jobs?.['portability-linux']?.['runs-on']).toEqual([
      'self-hosted',
      'Linux',
      'Docker',
      'Tests',
    ])
    expect(jobs?.['portability-macos']?.['runs-on']).toEqual(['self-hosted', 'macOS', 'Tests'])
  })

  it('pins portable Playwright support jobs to [self-hosted, Playwright]', () => {
    const expected = ['self-hosted', 'Playwright']
    expect(
      readWorkflow('.github/workflows/storybook.yml').jobs?.['storybook']?.['runs-on'],
    ).toEqual(expected)
  })

  it('pins aggregator and utility jobs to bare [self-hosted]', () => {
    const utilityJobs = [
      ['.github/workflows/ci-detect-changes.yml', 'detect-changes'],
      ['.github/workflows/ci-record-state.yml', 'record-state'],
      ['.github/workflows/ci-test-coverage.yml', 'test-coverage'],
      ['.github/workflows/ci.yml', 'tests'],
      ['.github/workflows/tests-playwright.yml', 'select'],
      ['.github/workflows/static-code-analysis.yml', 'static-code-analysis'],
      ['.github/workflows/checks-static.yml', 'static-backend'],
      ['.github/workflows/checks-static.yml', 'static-lambdas'],
      ['.github/workflows/checks-static.yml', 'static-cloudflare'],
    ] as const
    for (const [path, job] of utilityJobs) {
      expect(readWorkflow(path).jobs?.[job]?.['runs-on']).toEqual(['self-hosted'])
    }
  })

  it('pins static-web to [self-hosted, Linux] since it shares the build-web-targets artifact-shape contract (#10990)', () => {
    expect(
      readWorkflow('.github/workflows/checks-static.yml').jobs?.['static-web']?.['runs-on'],
    ).toEqual(['self-hosted', 'Linux'])
  })

  it('pins service-container test jobs to [self-hosted, Linux, Docker, Tests]', () => {
    const dockerTestJobs = [
      ['.github/workflows/tests-backend-unit.yml', 'backend-tests'],
      ['.github/workflows/checks-backend-smoke.yml', 'smoke'],
      ['.github/workflows/tests-backend-credentialed.yml', 'backend-credentialed-tests'],
      ['.github/workflows/tests-backend-modules.yml', 'backend-modules'],
      ['.github/workflows/tests-web.yml', 'web-tests'],
      ['.github/workflows/tests-web-api.yml', 'web-api-tests'],
    ] as const
    for (const [path, job] of dockerTestJobs) {
      expect(readWorkflow(path).jobs?.[job]?.['runs-on']).toEqual([
        'self-hosted',
        'Linux',
        'Docker',
        'Tests',
      ])
    }
  })

  it('pins the Next.js-building service-container job to include the CPU label', () => {
    const runner = readWorkflow('.github/workflows/tests-web-integration.yml').jobs?.[
      'web-integration-tests'
    ]?.['runs-on']
    expect(runner).toEqual(['self-hosted', 'Linux', 'Docker', 'Tests', 'CPU'])
  })

  it('sizes workflow prep jobs as lightweight self-hosted utility jobs', () => {
    for (const path of ['tests-web.yml', 'tests-backend-unit.yml'] as const) {
      expect(readWorkflow(`.github/workflows/${path}`).jobs?.prep?.['runs-on']).toEqual([
        'self-hosted',
      ])
    }
    expect(readWorkflow('.github/workflows/tests-web.yml').jobs?.['web-checks']).toBeUndefined()
  })

  it('pins service-container non-test jobs to [self-hosted, Linux, Docker]', () => {
    const dockerNonTestJobs = [
      ['.github/workflows/explain-analyze.yml', 'explain-analyze'],
      ['.github/workflows/initialize-smoke-test.yml', 'initialize-smoke-test'],
    ] satisfies [string, string][]

    const expected = ['self-hosted', 'Linux', 'Docker']
    for (const [path, job] of dockerNonTestJobs) {
      expect(readWorkflow(path).jobs?.[job]?.['runs-on']).toEqual(expected)
    }
  })

  it('does not pin self-hosted jobs to macOS directly (use Tests to reach macOS)', () => {
    const macosExemptWorkflows = new Set(['.github/workflows/tests-portability.yml'])
    for (const path of workflowPaths) {
      if (macosExemptWorkflows.has(path)) continue
      const workflow = readWorkflow(path)
      for (const job of Object.values(workflow.jobs ?? {})) {
        const runsOn = job['runs-on']
        if (!Array.isArray(runsOn)) continue
        expect(runsOn).not.toContain('macOS')
      }
    }
  })

  it('pins Playwright E2E jobs to [self-hosted, Linux, Docker, Playwright]', () => {
    const playwrightE2eJobs = [
      ['.github/workflows/tests-playwright.yml', 'playwright-tests'],
      ['.github/workflows/tests-playwright-credentialed.yml', 'playwright-credentialed-tests'],
    ] as const
    for (const [path, job] of playwrightE2eJobs) {
      expect(readWorkflow(path).jobs?.[job]?.['runs-on']).toEqual([
        'self-hosted',
        'Linux',
        'Docker',
        'Playwright',
      ])
    }
  })

  it('does not use GitHub-hosted runners', () => {
    const githubHostedLabel = /^(ubuntu|windows|macos)-/
    const violations: string[] = []

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        const runsOn = job['runs-on']
        const labels = Array.isArray(runsOn) ? runsOn : typeof runsOn === 'string' ? [runsOn] : []
        const hostedLabels = labels.filter(label => githubHostedLabel.test(label))
        if (hostedLabels.length > 0) {
          violations.push(
            `${path.replace(/^\.github\/workflows\//, '')}#${jobId}: ${hostedLabels.join(', ')}`,
          )
        }
      }
    }

    assertNoWorkflowViolations(violations)
  })

  it('runs actual Codex invocations on the shared self-hosted runner pool', () => {
    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [, job] of Object.entries(workflow.jobs ?? {})) {
        const invokesCodex = job.steps?.some(step => /\bcodex exec\b/.test(step.run ?? '')) ?? false
        if (!invokesCodex) continue
        expect(job['runs-on']).toEqual(['self-hosted'])
      }
    }
  })

  it('keeps Harness automation jobs on the shared self-hosted runner pool', () => {
    const automationWorkflows = new Set([
      '.github/workflows/fix-dependabot.yml',
      '.github/workflows/fix-issue.yml',
      '.github/workflows/fix-main.yml',
      '.github/workflows/fix-main-self-retry.yml',
      '.github/workflows/harness-dispatch.yml',
      '.github/workflows/plan.yml',
      '.github/workflows/scheduled-prompts.yml',
      '.github/workflows/shepherd.yml',
    ])
    for (const path of workflowPaths) {
      if (!automationWorkflows.has(path)) continue
      const workflow = readWorkflow(path)
      for (const job of Object.values(workflow.jobs ?? {})) {
        if (job.uses) continue
        expect(job['runs-on']).toEqual(['self-hosted'])
      }
    }
  })
})
