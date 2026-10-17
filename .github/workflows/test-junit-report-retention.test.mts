import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { classifyArtifact, isExplicitlyClassified } from '../../ci/cleanup-artifacts-patterns.mts'

type Step = {
  env?: Record<string, string>
  if?: string
  name?: string
  run?: string
  'continue-on-error'?: boolean
  uses?: string
  with?: Record<string, unknown>
}

const reports = [
  {
    artifact: 'web-api-junit-shard-${{ matrix.shard }}',
    file: 'tests-web-api.yml',
    job: 'web-api-tests',
    report: 'web-api-shard-${{ matrix.shard }}.junit.xml',
    variable: 'VITEST_JUNIT_OUTPUT_FILE',
  },
  {
    artifact: 'web-integration-junit-shard-${{ matrix.shard }}',
    file: 'tests-web-integration.yml',
    job: 'web-integration-tests',
    report: 'web-integration-shard-${{ matrix.shard }}.junit.xml',
    variable: 'VITEST_JUNIT_OUTPUT_FILE',
  },
  {
    artifact: 'lambdas-junit',
    file: 'tests-lambdas.yml',
    job: 'lambdas-tests',
    report: 'test-report.junit.xml',
    variable: 'VITEST_JUNIT_OUTPUT_FILE',
  },
  {
    artifact: 'postgres-schema-junit',
    file: 'tests-postgres-schema.yml',
    job: 'postgres-schema-tests',
    report: 'postgres-schema-test-report.junit.xml',
    variable: 'VITEST_JUNIT_OUTPUT_FILE',
  },
  {
    artifact: 'storybook-browser-junit',
    file: 'storybook.yml',
    job: 'storybook',
    report: 'storybook-browser-test-report.junit.xml',
    variable: 'VITEST_JUNIT_OUTPUT_FILE',
  },
  {
    artifact: 'cloudflare-worker-junit',
    file: 'tests-cloudflare-worker.yml',
    job: 'cloudflare-worker-tests',
    report: 'test-report.junit.xml',
    variable: 'VITEST_JUNIT_OUTPUT_FILE',
  },
  {
    artifact: 'playwright-junit-shard-${{ matrix.shard }}',
    file: 'tests-playwright.yml',
    job: 'playwright-tests',
    report: 'test-report.junit.xml',
    variable: 'PLAYWRIGHT_JUNIT_OUTPUT_FILE',
  },
  {
    artifact: 'playwright-credentialed-junit',
    file: 'tests-playwright-credentialed.yml',
    job: 'playwright-credentialed-tests',
    report: 'test-report.junit.xml',
    variable: 'PLAYWRIGHT_JUNIT_OUTPUT_FILE',
  },
]

describe('JUnit report retention', () => {
  it.each(reports)('$file retains a fresh report from successful runs', report => {
    const workflow = parse(readFileSync(`.github/workflows/${report.file}`, 'utf8')) as {
      jobs: Record<string, { steps: Step[] }>
    }
    const steps = workflow.jobs[report.job]?.steps ?? []
    const writerIndex = steps.findIndex(step => step.env?.[report.variable] === report.report)
    const clearIndex = steps.findIndex(step => step.run === `rm -f ${report.report}`)
    const uploaderIndex = steps.findIndex(
      step =>
        step.uses?.startsWith('actions/upload-artifact@') && step.with?.path === report.report,
    )
    const uploader = steps[uploaderIndex]
    const artifactName = report.artifact.replace('${{ matrix.shard }}', '12')

    expect(clearIndex).toBeGreaterThanOrEqual(0)
    expect(writerIndex).toBeGreaterThan(clearIndex)
    expect(uploaderIndex).toBeGreaterThan(writerIndex)
    expect(uploader).toMatchObject({
      if: '${{ !cancelled() }}',
      'continue-on-error': true,
      with: {
        'if-no-files-found': 'ignore',
        name: report.artifact,
        'retention-days': 1,
        path: report.report,
      },
    })
    expect(isExplicitlyClassified(artifactName)).toBe(true)
    expect(classifyArtifact(artifactName)).toBe('keep')
  })

  it('uses distinct artifact names for every selected suite and shard', () => {
    const names = reports.map(report => report.artifact.replace('${{ matrix.shard }}', '12'))
    expect(new Set(names).size).toBe(names.length)
  })
})
