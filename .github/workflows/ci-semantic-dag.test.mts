import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { routePolicy } from './workflow-topology-policy-routes.mts'

type Job = { if?: string; needs?: string[] }
type Workflow = { jobs?: Record<string, Job> }

function workflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function expectHardStaticGate(job: Job | undefined, staticJob: string): void {
  expect(job?.needs).toContain(staticJob)
  expect(job?.if).toContain(`needs.${staticJob}.result == 'success'`)
  expect(job?.if).not.toContain(`needs.${staticJob}.result == 'failure'`)
}

function expectSuccessOrSkippedTestGate(job: Job | undefined, prerequisite: string): void {
  expect(job?.needs).toContain(prerequisite)
  expect(job?.if).toContain('always()')
  expect(job?.if).toContain('!cancelled()')
  for (const result of ['success', 'skipped']) {
    expect(job?.if).toContain(`needs.${prerequisite}.result == '${result}'`)
  }
  expect(job?.if).toContain(
    `(github.event_name == 'workflow_dispatch' && needs.${prerequisite}.result == 'failure')`,
  )
}

describe('semantic CI dependency DAG', () => {
  it('enforces the global static chain and unrelated-suite isolation in topology policy', () => {
    const required = new Set(routePolicy.requiredDirectEdges.map(edge => edge.join(' -> ')))
    for (const area of ['backend', 'web', 'lambdas', 'cloudflare-worker']) {
      expect(required).toContain(
        `.github/workflows/ci.yml#static-code-analysis -> .github/workflows/ci.yml#static-${area}`,
      )
    }
    for (const backendConsumer of [
      'test-backend-modules',
      'test-backend-unit',
      'test-backend-credentialed',
    ]) {
      expect(required).toContain(
        `.github/workflows/ci.yml#test-ts-shared -> .github/workflows/ci.yml#${backendConsumer}`,
      )
    }
    for (const imageJob of ['build-backend', 'build-web']) {
      expect(required).toContain(
        `.github/workflows/ci.yml#tests -> .github/workflows/ci.yml#${imageJob}`,
      )
    }

    const forbidden = new Set(routePolicy.forbiddenTransitiveEdges.map(edge => edge.join(' -> ')))
    for (const unrelated of ['test-tooling', 'test-portability', 'storybook']) {
      for (const application of [
        'test-ts-shared',
        'test-backend-modules',
        'test-backend-unit',
        'backend-smoke',
        'test-backend-credentialed',
        'test-postgres-schema',
        'test-web',
        'test-web-api',
        'test-web-integration',
        'test-lambdas',
        'test-cloudflare-worker',
        'test-playwright',
        'test-playwright-credentialed',
      ]) {
        expect(forbidden).toContain(
          `.github/workflows/ci.yml#${unrelated} -> .github/workflows/ci.yml#${application}`,
        )
      }
    }
  })

  it('hard-gates each PR application area on its own static job', () => {
    const jobs = workflow('.github/workflows/ci.yml').jobs
    const areaTests = {
      'static-backend': [
        'test-backend-modules',
        'test-backend-unit',
        'backend-smoke',
        'test-backend-credentialed',
        'test-postgres-schema',
        'test-explain-analyze',
      ],
      'static-web': ['test-web', 'test-web-api', 'test-web-integration'],
      'static-lambdas': ['test-lambdas'],
      'static-cloudflare-worker': ['test-cloudflare-worker'],
    } as const

    for (const [staticJob, testJobs] of Object.entries(areaTests)) {
      for (const testJob of testJobs) {
        expectHardStaticGate(jobs?.[testJob], staticJob)
      }
    }
  })

  it('suppresses dependent PR tests after predecessor failures', () => {
    const jobs = workflow('.github/workflows/ci.yml').jobs

    for (const consumer of [
      'test-backend-modules',
      'test-backend-unit',
      'test-backend-credentialed',
    ]) {
      expectSuccessOrSkippedTestGate(jobs?.[consumer], 'test-ts-shared')
    }
    for (const consumer of ['test-web-api', 'test-web-integration']) {
      expectSuccessOrSkippedTestGate(jobs?.[consumer], 'test-web')
    }
    expect(jobs?.['test-web-api']?.needs).not.toContain('test-web-integration')
    expect(jobs?.['test-web-integration']?.needs).not.toContain('test-web-api')
  })

  it('waits for application Vitest before sibling Playwright suites', () => {
    const jobs = workflow('.github/workflows/ci.yml').jobs
    const applicationRoots = [
      'test-ts-shared',
      'test-backend-modules',
      'test-backend-unit',
      'test-postgres-schema',
      'test-web',
      'test-web-api',
      'test-web-integration',
      'test-lambdas',
      'test-cloudflare-worker',
    ]

    for (const playwright of ['test-playwright', 'test-playwright-credentialed']) {
      for (const root of applicationRoots) {
        expectSuccessOrSkippedTestGate(jobs?.[playwright], root)
      }
    }
    expectSuccessOrSkippedTestGate(
      jobs?.['test-playwright-credentialed'],
      'test-backend-credentialed',
    )
    expect(jobs?.['test-playwright']?.needs).not.toContain('test-backend-credentialed')

    for (const unrelated of ['test-tooling', 'test-portability', 'storybook']) {
      expect(jobs?.['test-playwright']?.needs).not.toContain(unrelated)
      expect(jobs?.['test-playwright-credentialed']?.needs).not.toContain(unrelated)
    }
    expect(jobs?.['test-playwright']?.needs).not.toContain('test-playwright-credentialed')
    expect(jobs?.['test-playwright-credentialed']?.needs).not.toContain('test-playwright')
  })

  it('starts Docker image validation only after required tests pass', () => {
    const jobs = workflow('.github/workflows/ci.yml').jobs
    for (const imageJob of ['build-backend', 'build-web']) {
      expect(jobs?.[imageJob]?.needs).toContain('tests')
      expect(jobs?.[imageJob]?.if).toContain(
        "(github.event_name == 'workflow_dispatch' || needs.tests.result == 'success')",
      )
      expect(jobs?.[imageJob]?.if).not.toContain("needs.tests.result == 'skipped'")
      expect(jobs?.[imageJob]?.if).not.toContain("needs.tests.result == 'failure'")
    }
    expect(jobs?.build?.needs).toEqual(['tests', 'build-backend', 'build-web'])
    expect(jobs?.build?.if).toContain('!cancelled()')
  })

  it('keeps grouped main workflows independent after their static checks', () => {
    const backend = workflow('.github/workflows/main-backend.yml').jobs
    for (const testJob of [
      'test-backend-modules',
      'test-backend-unit',
      'backend-smoke',
      'test-backend-credentialed',
      'postgres-schema-tests',
    ]) {
      expectHardStaticGate(backend?.[testJob], 'static-checks')
    }

    // Main prioritizes wall-clock time: web tests and both Playwright suites fan out directly
    // from static-checks. PR and merge-group CI instead gates Playwright to save compute on red runs.
    const web = workflow('.github/workflows/main-web.yml').jobs
    for (const testJob of [
      'test-web',
      'test-web-api',
      'test-web-integration',
      'playwright-tests',
      'playwright-credentialed-tests',
    ]) {
      expectHardStaticGate(web?.[testJob], 'static-checks')
      expect(web?.[testJob]?.needs).toEqual(['static-checks'])
    }

    expectHardStaticGate(
      workflow('.github/workflows/main-lambdas.yml').jobs?.['lambdas-tests'],
      'static-checks',
    )
    expectHardStaticGate(
      workflow('.github/workflows/main-cloudflare-worker.yml').jobs?.['cloudflare-worker-tests'],
      'static-checks',
    )
  })
})
