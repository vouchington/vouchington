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

const staticJobs = [
  'static-code-analysis',
  'static-backend',
  'static-web',
  'static-lambdas',
  'static-cloudflare-worker',
]
const staticGatedPrJobs = [
  'test-ts-shared',
  'test-tooling',
  'test-backend-modules',
  'test-backend-unit',
  'backend-smoke',
  'test-backend-credentialed',
  'test-postgres-schema',
  'test-web',
  'storybook',
  'test-web-api',
  'test-web-integration',
  'test-playwright',
  'test-playwright-credentialed',
  'test-cloudflare-worker',
  'test-lambdas',
  'test-explain-analyze',
  'test-portability',
  'build-backend',
  'build-web',
]

describe('semantic CI dependency DAG', () => {
  it('enforces the static-only gate and unrelated-suite isolation in topology policy', () => {
    const ci = (job: string): string => `.github/workflows/ci.yml#${job}`
    const required = new Set(routePolicy.requiredDirectEdges.map(edge => edge.join(' -> ')))
    for (const area of ['backend', 'web', 'lambdas', 'cloudflare-worker']) {
      expect(required).toContain(`${ci('static-code-analysis')} -> ${ci(`static-${area}`)}`)
    }
    for (const [area, imageJob] of [
      ['static-backend', 'build-backend'],
      ['static-web', 'build-web'],
    ]) {
      expect(required).toContain(`${ci('static-code-analysis')} -> ${ci(imageJob)}`)
      expect(required).toContain(`${ci(area)} -> ${ci(imageJob)}`)
      expect(required).not.toContain(`${ci('tests')} -> ${ci(imageJob)}`)
    }

    const forbiddenDirect = new Set(routePolicy.forbiddenDirectEdges.map(edge => edge.join(' -> ')))
    for (const from of staticGatedPrJobs) {
      for (const to of staticGatedPrJobs.filter(job => job !== from)) {
        expect(forbiddenDirect).toContain(`${ci(from)} -> ${ci(to)}`)
      }
    }
    for (const imageJob of ['build-backend', 'build-web']) {
      expect(forbiddenDirect).toContain(`${ci('tests')} -> ${ci(imageJob)}`)
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
        expect(forbidden).toContain(`${ci(unrelated)} -> ${ci(application)}`)
      }
    }
  })

  it('hard-gates each PR test and Docker build on its area static job', () => {
    const jobs = workflow('.github/workflows/ci.yml').jobs
    const areaJobs = {
      'static-backend': [
        'test-backend-modules',
        'test-backend-unit',
        'backend-smoke',
        'test-backend-credentialed',
        'test-postgres-schema',
        'test-explain-analyze',
        'test-playwright',
        'test-playwright-credentialed',
        'build-backend',
      ],
      'static-web': [
        'test-web',
        'test-web-api',
        'test-web-integration',
        'test-playwright',
        'test-playwright-credentialed',
        'build-web',
      ],
      'static-lambdas': ['test-lambdas', 'test-playwright', 'test-playwright-credentialed'],
      'static-cloudflare-worker': [
        'test-cloudflare-worker',
        'test-playwright',
        'test-playwright-credentialed',
      ],
    } as const

    for (const [staticJob, gatedJobs] of Object.entries(areaJobs)) {
      for (const gatedJob of gatedJobs) {
        expectHardStaticGate(jobs?.[gatedJob], staticJob)
      }
    }
    for (const gatedJob of staticGatedPrJobs.filter(job => job !== 'backend-smoke')) {
      expectHardStaticGate(jobs?.[gatedJob], 'static-code-analysis')
    }
  })

  it('never makes a PR test or Docker build wait on another test', () => {
    const jobs = workflow('.github/workflows/ci.yml').jobs
    const allowedNeeds = new Set(['detect-changes', 'select-ci', ...staticJobs])

    for (const job of staticGatedPrJobs) {
      expect(jobs?.[job]?.needs?.filter(need => !allowedNeeds.has(need))).toEqual([])
      expect(jobs?.[job]?.if).toContain('!cancelled()')
      expect(jobs?.[job]?.if).not.toContain('always()')
      expect(jobs?.[job]?.if).not.toMatch(/needs\.(tests?|storybook|build)[\w-]*\.result/)
    }
  })

  it('keeps the fan-ins waiting on every test and Docker build', () => {
    const jobs = workflow('.github/workflows/ci.yml').jobs
    for (const job of ['test-playwright', 'test-playwright-credentialed']) {
      expect(jobs?.['tests-processing']?.needs).toContain(job)
    }
    expect(jobs?.['tests-processing']?.needs).toContain('test-coverage')
    expect(jobs?.tests?.needs).toEqual(['tests-processing'])
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

    // Web tests and both Playwright suites fan out directly from static-checks, as in PR CI.
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
