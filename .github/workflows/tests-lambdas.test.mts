import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse as load } from 'yaml'

const workflow = readFileSync('.github/workflows/tests-lambdas.yml', 'utf8')
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8')

type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown> }
type Job = {
  if?: string
  needs?: string[]
  permissions?: Record<string, string>
  steps?: Step[]
}
type MainWorkflow = { jobs?: Record<string, Job> }

function workflowFiles(): Array<{ contents: string; path: string }> {
  return readdirSync('.github/workflows')
    .filter(path => path.endsWith('.yml') || path.endsWith('.yaml'))
    .map(path => ({ contents: readFileSync(`.github/workflows/${path}`, 'utf8'), path }))
}

describe('Lambda Tests workflow', () => {
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

  it('uses the shared full install without another direct install', () => {
    expect(workflow).toContain('- uses: ./.github/actions/setup-node-pnpm')
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

  it('publishes one attempt-bound image-resize package only after validation succeeds', () => {
    const parsed = load(mainWorkflow) as MainWorkflow
    const publish = parsed.jobs?.['publish-image-resize']

    expect(publish?.needs).toEqual(['static-checks', 'lambdas-tests'])
    expect(publish?.if).toContain("needs.static-checks.result == 'success'")
    expect(publish?.if).toContain("needs.lambdas-tests.result == 'success'")
    expect(publish?.permissions).toEqual({ contents: 'read' })

    const build = publish?.steps?.find(step =>
      step.name?.startsWith('Build and validate the image-resize'),
    )
    expect(build?.run).toContain('pnpm --filter @lambdas/image-resize run build')
    expect(build?.run).toContain('unzip -t lambdas/image-resize/dist/function.zip')
    expect(build?.run).toContain('zipinfo -1 lambdas/image-resize/dist/function.zip')
    expect(build?.run).toContain(
      'cp lambdas/image-resize/dist/function.zip delivery/image-resize.zip',
    )

    const upload = publish?.steps?.find(step => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload?.uses?.slice('actions/upload-artifact@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(upload?.with).toMatchObject({
      'if-no-files-found': 'error',
      name: 'image-resize-lambda-${{ github.run_id }}-${{ github.run_attempt }}',
      overwrite: true,
      path: 'delivery/image-resize.zip',
      'retention-days': 1,
    })
  })
})
