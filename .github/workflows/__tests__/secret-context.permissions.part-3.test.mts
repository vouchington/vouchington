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

function mappingSection(workflow: string, key: string): string {
  const start = workflow.indexOf(`\n  ${key}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z_][a-z0-9_-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('secret-backed workflow context gates (permissions and security)', () => {
  it('passes a reusable trusted_secret_context input to secret-backed workflows', () => {
    const directlyDispatchablePaths = [
      '.github/workflows/tests-backend-credentialed.yml',
      '.github/workflows/tests-playwright-credentialed.yml',
    ]

    for (const path of directlyDispatchablePaths) {
      const workflow = read(path)
      expect(workflow).toContain('trusted_secret_context:')
      expect(workflow).toContain(
        "description: 'Whether this run may use repository secrets and OIDC roles'",
      )
      expect(workflow).toContain('type: boolean')
      expect(mappingSection(workflow, 'workflow_call')).toContain('default: false')
      expect(mappingSection(workflow, 'workflow_dispatch')).toContain('trusted_secret_context:')
      expect(mappingSection(workflow, 'workflow_dispatch')).toContain('default: true')
      expect(workflow).toContain('inputs.trusted_secret_context')
      expect(workflow).not.toContain(
        "if: ${{ github.event_name != 'pull_request' || inputs.trusted_secret_context }}",
      )
    }

    expect(read('.github/workflows/tests-playwright.yml')).toContain(
      '\npermissions:\n  contents: read\n',
    )
    expect(
      jobSection(read('.github/workflows/tests-playwright.yml'), 'playwright-tests'),
    ).not.toContain('id-token: write')
    expect(read('.github/workflows/tests-playwright.yml')).toContain('if: inputs.otel_enabled')
    // credentialed suite: ci.yml job gated on trusted-secret-context; workflow has secrets+OIDC
    const credJob = jobSection(read('.github/workflows/ci.yml'), 'test-playwright-credentialed')
    expect(credJob).toContain("needs.detect-changes.outputs.trusted-secret-context == 'true'")
    expect(credJob).not.toContain('OPENAI_API_KEY')
    expect(credJob).toContain('id-token: write')
    const credWf = read('.github/workflows/tests-playwright-credentialed.yml')
    expect(credWf).not.toContain('OPENAI_API_KEY')
    expect(credWf).not.toContain('./.github/actions/upload-codecov')
  })

  it('keeps static analysis independent of repository secrets', () => {
    const workflow = read('.github/workflows/static-code-analysis.yml')

    expect(workflow).not.toContain('trusted_secret_context')
    expect(workflow).not.toContain('EXEC_GITHUB_TOKEN')
    expect(workflow).not.toContain('secrets.')
  })
})
