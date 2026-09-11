import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type SmokeWorkflow = {
  env?: Record<string, string>
  permissions?: Record<string, string>
  jobs?: Record<
    string,
    {
      'runs-on'?: string[]
      'timeout-minutes'?: number
      services?: Record<string, { image?: string }>
      steps?: Array<{ name?: string; uses?: string; run?: string; env?: Record<string, string> }>
    }
  >
}

const source = readFileSync('.github/workflows/checks-backend-smoke.yml', 'utf8')
const workflow = load(source) as SmokeWorkflow
const smoke = workflow.jobs?.smoke

describe('checks-backend-smoke workflow', () => {
  it('owns the dedicated Tests-pool API and worker smoke gate', () => {
    expect(workflow).toMatchObject({ name: 'backend-smoke' })
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.env).toEqual({ NODE_ENV: 'test' })
    expect(smoke?.['runs-on']).toEqual(['self-hosted', 'Linux', 'Docker', 'Tests'])
    expect(smoke?.services?.postgres?.image).toMatch(/^pgvector\/pgvector:pg18@sha256:/)
    expect(smoke?.services?.valkey?.image).toMatch(
      /^valkey\/valkey-bundle:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/u,
    )
  })

  it('migrates before the allocated-port API and worker smoke without coverage transport', () => {
    const steps = smoke?.steps ?? []
    const servicePorts = steps.findIndex(step => step.name === 'Set service ports')
    const setup = steps.findIndex(step => step.uses === './.github/actions/setup-backend')
    const migration = steps.findIndex(step => step.name === 'Migrate backend database')
    const allocation = steps.findIndex(step => step.name === 'Allocate backend port')
    const smokeTest = steps.findIndex(step => step.name === 'Smoke test backend')

    expect(servicePorts).toBeGreaterThanOrEqual(0)
    expect(servicePorts).toBeLessThan(setup)
    expect(setup).toBeLessThan(migration)
    expect(migration).toBeLessThan(allocation)
    expect(allocation).toBeLessThan(smokeTest)
    expect(steps[smokeTest]?.run).toContain(
      './scripts/tests/smoke-test-server.sh && ./scripts/tests/smoke-test-worker.sh',
    )
    expect(source).not.toContain('NODE_V8_COVERAGE')
    expect(source).not.toContain('artifact-upload-outcome')
    expect(source).not.toContain('VITEST_MAX_WORKERS')
  })

  it('keeps failure-only port diagnostics with the standalone smoke suffix', () => {
    expect(source).toContain("failure() && env.BROWSER_ALLOCATED_PORTS != ''")
    expect(source).toContain('continue-on-error: true')
    expect(source).toContain('artifact-suffix: backend-smoke')
  })
})
