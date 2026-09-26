import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Job = { if?: string; needs?: string[] }
type Workflow = { jobs?: Record<string, Job> }

function workflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function expectHardStaticGate(job: Job | undefined): void {
  expect(job?.needs).toContain('static-checks')
  expect(job?.if).toContain("needs.static-checks.result == 'success'")
  expect(job?.if).not.toContain("needs.static-checks.result == 'failure'")
}

describe('grouped main dependency DAG', () => {
  it('keeps main workflows independent after their static checks', () => {
    const backend = workflow('.github/workflows/main-backend.yml').jobs
    for (const testJob of [
      'test-backend-modules',
      'test-backend-unit',
      'backend-smoke',
      'test-backend-credentialed',
      'postgres-schema-tests',
    ]) {
      expectHardStaticGate(backend?.[testJob])
    }

    const web = workflow('.github/workflows/main-web.yml').jobs
    for (const testJob of [
      'test-web',
      'test-web-api',
      'test-web-integration',
      'playwright-tests',
      'playwright-credentialed-tests',
    ]) {
      expectHardStaticGate(web?.[testJob])
      expect(web?.[testJob]?.needs).toEqual(['static-checks'])
    }

    expectHardStaticGate(workflow('.github/workflows/main-lambdas.yml').jobs?.['lambdas-tests'])
    expectHardStaticGate(
      workflow('.github/workflows/main-cloudflare-worker.yml').jobs?.['cloudflare-worker-tests'],
    )
  })
})
