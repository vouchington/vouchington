import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-lambdas.yml', 'utf8')
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8')
const mainWorkflow = readFileSync('.github/workflows/main-lambdas.yml', 'utf8')

function workflowFiles(): Array<{ contents: string; path: string }> {
  return readdirSync('.github/workflows')
    .filter(path => path.endsWith('.yml') || path.endsWith('.yaml'))
    .map(path => ({ contents: readFileSync(`.github/workflows/${path}`, 'utf8'), path }))
}

describe('Lambda Tests workflow', () => {
  it('runs PR and main Lambda checks when the shared listener policy changes', () => {
    const pathFilters = readFileSync('.github/ci-path-filters.yml', 'utf8')
    const lambdasFilter = pathFilters.slice(
      pathFilters.indexOf('\nlambdas:'),
      pathFilters.indexOf('\nexplain-analyze:'),
    )

    for (const policyPath of ['ci/runner-port-policy.json', 'ci/runner-port-policy.mts']) {
      expect(lambdasFilter).toContain(`- '${policyPath}'`)
      expect(mainWorkflow).toContain(`- '${policyPath}'`)
    }
  })

  it('leaves dependency and TypeScript checks with checks-static.yml', () => {
    const install = workflow.indexOf('uses: ./.github/actions/setup-node-pnpm')
    const tests = workflow.indexOf('vitest run --bail=3 --project lambdas')

    expect(install).toBeGreaterThanOrEqual(0)
    expect(tests).toBeGreaterThan(install)
    expect(workflow).not.toContain('Check lambda dependencies')
    expect(workflow).not.toContain('Typecheck lambdas')
    expect(workflow).not.toContain('pnpm exec tsc --noEmit --project lambdas/tsconfig.json')
  })

  it('does not build the retired SES inbound artifact', () => {
    expect(workflow).not.toContain('ses-inbound-arm64-artifact:')
    expect(workflow).not.toContain('ses-inbound-artifact:')
    expect(workflow).not.toContain('pnpm --filter @lambdas/ses-inbound run build')
    expect(ciWorkflow).not.toContain("- 'ts-shared/ses-inbound-contract/**'")
  })

  it('uses the shared persistent full install without another direct install', () => {
    expect(workflow).toContain('runner-lifecycle: persistent')
    expect(workflow).not.toContain('pnpm install')
    expect(workflow).not.toContain('timeout_prefix')
  })

  it('rejects unbraced Lambda path filters in all workflows', () => {
    const unbracedLambdaPathFilter = /--filter\s+["']?\.\/lambdas\/[\w-]+\.\.\./g
    const violations = workflowFiles().flatMap(({ contents, path }) =>
      Array.from(contents.matchAll(unbracedLambdaPathFilter), match => `${path}: ${match[0]}`),
    )

    expect(violations).toEqual([])
  })
})
