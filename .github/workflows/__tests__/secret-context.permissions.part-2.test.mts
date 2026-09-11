import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

function jobSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

function pathFilterSection(workflow: string, filterName: string): string {
  const start = workflow.indexOf(`\n${filterName}:\n`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('secret-backed workflow context gates (permissions and security)', () => {
  it('passes trusted context into the single backend workflow call', () => {
    const workflow = read('.github/workflows/ci.yml')
    const staticAnalysis = jobSection(workflow, 'static-code-analysis')
    const backendUnit = jobSection(workflow, 'test-backend-unit')
    const backendIntegration = jobSection(workflow, 'test-backend-credentialed')

    expect(staticAnalysis).toContain('uses: ./.github/workflows/static-code-analysis.yml')
    expect(staticAnalysis).toContain('contents: read')
    expect(staticAnalysis).not.toContain('trusted_secret_context')
    expect(staticAnalysis).not.toContain('secrets: inherit')
    expect(workflow).not.toContain('static-code-analysis-trusted')
    expect(workflow).not.toContain('static-code-analysis-untrusted')
    expect(backendUnit).toContain('uses: ./.github/workflows/tests-backend-unit.yml')
    expect(backendUnit).toContain('contents: read')
    expect(backendUnit).not.toContain('id-token: write')
    expect(backendUnit).not.toContain('secrets:')
    expect(backendIntegration).toContain('uses: ./.github/workflows/tests-backend-credentialed.yml')
    expect(backendIntegration).toContain('contents: read')
    expect(backendIntegration).toContain('id-token: write')
    expect(backendIntegration).toContain(
      "trusted_secret_context: ${{ needs.detect-changes.outputs.trusted-secret-context == 'true' }}",
    )
    expect(backendIntegration).toContain('secrets:')
    expect(backendIntegration).toContain(
      "OPENAI_API_KEY: ${{ needs.detect-changes.outputs.trusted-secret-context == 'true' && secrets.OPENAI_API_KEY || '' }}",
    )
    expect(backendIntegration).not.toContain('secrets: inherit')
    expect(workflow).not.toContain('test-backend-trusted')
    expect(workflow).not.toContain('test-backend-untrusted')
  })

  it('runs credentialed Stripe tests for module Stripe changes', () => {
    const backendCredentialedFilter = pathFilterSection(
      read('.github/ci-path-filters.yml'),
      'backend-credentialed',
    )

    expect(backendCredentialedFilter).toContain("- 'backend/modules/stripe/**'")
    expect(backendCredentialedFilter).toContain("- 'backend/services/stripe/**'")
  })

  it('downscopes local-only reusable workflow callers', () => {
    const workflow = read('.github/workflows/ci.yml')
    const coverageTransportJobs = [
      'test-ts-shared',
      'test-tooling',
      'test-web',
      'test-cloudflare-worker',
    ]
    const localOnlyJobs = [
      'initialize-smoke-test',
      'test-web-integration',
      'test-lambdas',
      'test-explain-analyze',
    ]

    for (const job of coverageTransportJobs) {
      const section = jobSection(workflow, job)

      expect(section).toContain('permissions:')
      expect(section).toContain('contents: read')
      expect(section).toContain('actions: read')
      expect(section).not.toContain('id-token: write')
      expect(section).not.toContain('secrets: inherit')
    }

    for (const job of localOnlyJobs) {
      const section = jobSection(workflow, job)

      expect(section).toContain('permissions:')
      expect(section).toContain('contents: read')
      expect(section).not.toContain('id-token: write')
      expect(section).not.toContain('secrets: inherit')
    }

    const playwrightJob = jobSection(workflow, 'test-playwright')
    expect(playwrightJob).toContain('permissions:')
    expect(playwrightJob).toContain('contents: read')
    expect(playwrightJob).not.toContain('id-token: write')
    expect(playwrightJob).toContain(
      "otel_enabled: ${{ vars.PLAYWRIGHT_OTEL_ENABLED == 'true' && github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.detect-changes.outputs.trusted-secret-context == 'true' }}",
    )
    expect(playwrightJob).not.toContain('secrets: inherit')

    // store-playwright-otel moved to main-web.yml (main-only push workflow)
    const mainWebWorkflow = read('.github/workflows/main-web.yml')
    const playwrightOtelStoreJob = jobSection(mainWebWorkflow, 'store-playwright-otel')
    expect(playwrightOtelStoreJob).toContain(
      "(needs.playwright-tests.result == 'success' || needs.playwright-tests.result == 'failure')",
    )
    expect(playwrightOtelStoreJob).toContain(
      'role-to-assume: ${{ secrets.AWS_OTEL_STORE_ROLE_ARN }}',
    )
    expect(playwrightOtelStoreJob).not.toContain('role-to-assume: ${{ secrets.AWS_TEST_ROLE_ARN }}')
    expect(playwrightOtelStoreJob).toContain('id-token: write')
    expect(playwrightOtelStoreJob).not.toContain('secrets: inherit')
  })

  it('downscopes non-secret orchestration jobs that execute local shell', () => {
    const workflow = read('.github/workflows/ci.yml')
    const jobs = ['detect-changes', 'static-code-analysis']

    for (const job of jobs) {
      const section = jobSection(workflow, job)

      expect(section).toContain('permissions:')
      expect(section).toContain('contents: read')
      expect(section).not.toContain('id-token: write')
    }

    expect(jobSection(workflow, 'detect-changes')).toContain('pull-requests: read')
  })

  it('keeps local-only reusable workflows free of secrets', () => {
    const coverageTransportWorkflowPaths = [
      '.github/workflows/tests-ts-shared.yml',
      '.github/workflows/tests-tooling.yml',
      '.github/workflows/tests-web.yml',
      '.github/workflows/tests-cloudflare-worker.yml',
    ]
    const noOidcWorkflowPaths = [
      '.github/workflows/tests-web-integration.yml',
      '.github/workflows/tests-lambdas.yml',
    ]

    for (const path of coverageTransportWorkflowPaths) {
      const workflow = read(path)

      expect(workflow).toContain('contents: read')
      expect(workflow).toContain('actions: read')
      expect(workflow).not.toContain('id-token: write')
      expect(workflow).not.toContain('secrets.')
    }

    for (const path of noOidcWorkflowPaths) {
      const workflow = read(path)

      expect(workflow).toContain('contents: read')
      expect(workflow).not.toContain('id-token: write')
      expect(workflow).not.toContain('./.github/actions/upload-codecov')
      expect(workflow).not.toContain('secrets.')
    }

    expect(read('.github/workflows/tests-playwright.yml')).not.toContain(
      './.github/actions/upload-codecov',
    )
  })

  it('keeps backend credential jobs in the single reusable workflow', () => {
    const credentialedWorkflow = read('.github/workflows/tests-backend-credentialed.yml')
    const unitWorkflow = read('.github/workflows/tests-backend-unit.yml')

    expect(credentialedWorkflow).toContain('\npermissions:\n  contents: read\n  id-token: write')
    expect(credentialedWorkflow).toContain('OPENAI_API_KEY:\n        required: false')
    expect(credentialedWorkflow).toContain('backend-credentialed-tests:')
    expect(credentialedWorkflow).toContain('if: ${{ inputs.trusted_secret_context }}')
    expect(credentialedWorkflow).toContain('AWS_TEST_ROLE_ARN: ${{ secrets.AWS_TEST_ROLE_ARN }}')
    expect(credentialedWorkflow).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')
    expect(credentialedWorkflow).not.toContain('backend-aws-tests:')
    expect(credentialedWorkflow).not.toContain('backend-openai-tests:')
    expect(credentialedWorkflow).not.toContain('backend-bedrock-tests:')

    expect(unitWorkflow).not.toContain('backend-aws-tests:')
    expect(unitWorkflow).not.toContain('backend-openai-tests:')
    expect(unitWorkflow).not.toContain('trusted_secret_context')
  })
})
