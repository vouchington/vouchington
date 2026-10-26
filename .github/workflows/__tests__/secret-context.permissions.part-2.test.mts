import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

function jobSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

type WorkflowSecret = { required?: boolean }

type WorkflowJob = {
  uses?: string
  secrets?: string | Record<string, unknown>
}

type WorkflowDocument = {
  on?: { workflow_call?: { secrets?: Record<string, WorkflowSecret> } }
  jobs?: Record<string, WorkflowJob>
}

function localWorkflowPaths(): string[] {
  return readdirSync('.github/workflows').flatMap(file =>
    file.endsWith('.yml') || file.endsWith('.yaml') ? [`.github/workflows/${file}`] : [],
  )
}

function workflowDocuments(): Record<string, WorkflowDocument> {
  return Object.fromEntries(
    localWorkflowPaths().map(path => [path, load(read(path)) as WorkflowDocument]),
  )
}

function localCalleePath(uses: string | undefined): string | undefined {
  if (!uses?.startsWith('./.github/workflows/')) return undefined
  return uses.slice('./'.length)
}

function workflowCallSecretViolations(workflows: Record<string, WorkflowDocument>): string[] {
  return Object.entries(workflows).flatMap(([path, workflow]) =>
    Object.entries(workflow.jobs ?? {}).flatMap(([jobId, job]) => {
      const label = `${path}#${jobId}`
      if (job.secrets === 'inherit') {
        return [`${label}: pass the callee declared secrets explicitly`]
      }
      const calleePath = localCalleePath(job.uses)
      if (!calleePath) return []
      const declared = workflows[calleePath]?.on?.workflow_call?.secrets ?? {}
      const passed = job.secrets == null ? [] : Object.keys(job.secrets)
      return [
        ...passed
          .filter(name => !Object.hasOwn(declared, name))
          .map(name => `${label}: ${name} is not declared by ${calleePath}`),
        ...Object.entries(declared)
          .filter(([name, spec]) => spec?.required === true && !passed.includes(name))
          .map(([name]) => `${label}: pass required secret ${name} from ${calleePath}`),
      ]
    }),
  )
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
    const workflow = read('.github/workflows/backend.yml')
    const staticAnalysis = jobSection(read('.github/workflows/static.yml'), 'static-code-analysis')
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
      "trusted_secret_context: ${{ needs.changes.outputs.trusted-secret-context == 'true' }}",
    )
    expect(backendIntegration).toContain('secrets:')
    expect(backendIntegration).toContain(
      "OPENAI_API_KEY: ${{ needs.changes.outputs.trusted-secret-context == 'true' && secrets.OPENAI_API_KEY || '' }}",
    )
    expect(backendIntegration).toContain(
      "OPENROUTER_API_KEY: ${{ needs.changes.outputs.trusted-secret-context == 'true' && secrets.OPENROUTER_API_KEY || '' }}",
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
    const coverageTransportJobs = [
      ['tooling', 'test-ts-shared'],
      ['tooling', 'test-tooling'],
      ['web', 'test-web'],
      ['cloudflare-worker', 'test-cloudflare-worker'],
    ]
    const localOnlyJobs = [
      ['tooling', 'initialize-smoke-test'],
      ['web', 'test-web-integration'],
      ['lambdas', 'test-lambdas'],
      ['backend', 'test-explain-analyze'],
    ]

    for (const [area, job] of coverageTransportJobs) {
      const workflow = read(`.github/workflows/${area}.yml`)
      const section = jobSection(workflow, job)

      expect(section).toContain('permissions:')
      expect(section).toContain('contents: read')
      expect(section).toContain('actions: read')
      expect(section).not.toContain('id-token: write')
      expect(section).not.toContain('secrets: inherit')
    }

    for (const [area, job] of localOnlyJobs) {
      const workflow = read(`.github/workflows/${area}.yml`)
      const section = jobSection(workflow, job)

      expect(section).toContain('permissions:')
      expect(section).toContain('contents: read')
      expect(section).not.toContain('id-token: write')
      expect(section).not.toContain('secrets: inherit')
    }

    const playwrightJob = jobSection(read('.github/workflows/web.yml'), 'test-playwright')
    expect(playwrightJob).toContain('permissions:')
    expect(playwrightJob).toContain('contents: read')
    expect(playwrightJob).not.toContain('id-token: write')
    expect(playwrightJob).not.toContain('otel_enabled:')
    expect(playwrightJob).not.toContain('secrets: inherit')

    expect(read('.github/workflows/main-web.yml')).not.toContain('AWS_OTEL_STORE_ROLE_ARN')
  })

  it('downscopes non-secret orchestration jobs that execute local shell', () => {
    for (const [area, job] of [
      ['backend', 'changes'],
      ['static', 'static-code-analysis'],
    ]) {
      const section = jobSection(read(`.github/workflows/${area}.yml`), job)

      expect(section).toContain('permissions:')
      expect(section).toContain('contents: read')
      expect(section).not.toContain('id-token: write')
    }

    expect(jobSection(read('.github/workflows/backend.yml'), 'changes')).toContain(
      'pull-requests: read',
    )
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

    expect(jobSection(credentialedWorkflow, 'backend-credentialed-tests')).toContain(
      '      id-token: write',
    )
    expect(credentialedWorkflow).toContain('OPENAI_API_KEY:\n        required: false')
    expect(credentialedWorkflow).toContain('backend-credentialed-tests:')
    expect(credentialedWorkflow).toContain(
      'if: ${{ !cancelled() && !failure() && inputs.trusted_secret_context }}',
    )
    expect(credentialedWorkflow).toContain('AWS_TEST_ROLE_ARN: ${{ secrets.AWS_TEST_ROLE_ARN }}')
    expect(credentialedWorkflow).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')
    expect(credentialedWorkflow).not.toContain('backend-aws-tests:')
    expect(credentialedWorkflow).not.toContain('backend-openai-tests:')
    expect(credentialedWorkflow).not.toContain('backend-bedrock-tests:')

    expect(unitWorkflow).not.toContain('backend-aws-tests:')
    expect(unitWorkflow).not.toContain('backend-openai-tests:')
    expect(unitWorkflow).not.toContain('trusted_secret_context')
  })

  it('passes only secrets the called workflow declares', () => {
    const callee = '.github/workflows/publish.yml'
    const token = { required: true }
    const optional = { required: false }
    const workflows = {
      [callee]: { on: { workflow_call: { secrets: { TOKEN: token, OPTIONAL: optional } } } },
      'caller.yml': {
        jobs: {
          inherit: { uses: `./${callee}`, secrets: 'inherit' },
          extra: { uses: `./${callee}`, secrets: { TOKEN: 'x', OTHER: 'y' } },
          missing: { uses: `./${callee}`, secrets: { OPTIONAL: 'x' } },
          explicit: { uses: `./${callee}`, secrets: { TOKEN: 'x' } },
        },
      },
    }

    expect(workflowCallSecretViolations(workflows)).toEqual([
      'caller.yml#inherit: pass the callee declared secrets explicitly',
      'caller.yml#extra: OTHER is not declared by .github/workflows/publish.yml',
      'caller.yml#missing: pass required secret TOKEN from .github/workflows/publish.yml',
    ])
    expect(workflowCallSecretViolations(workflowDocuments())).toEqual([])
  })
})
