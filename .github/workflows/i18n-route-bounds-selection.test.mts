import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

import picomatch from 'picomatch'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  on?: Record<
    string,
    {
      inputs?: Record<string, { default?: unknown; required?: boolean; type?: string }>
      outputs?: Record<string, { value: string }>
    }
  >
  jobs?: Record<
    string,
    {
      if?: string
      needs?: string[]
      outputs?: Record<string, string>
      steps?: Array<{
        id?: string
        name?: string
        run?: string
        env?: Record<string, string>
      }>
      with?: Record<string, string>
    }
  >
}

const readYaml = async <T,>(path: string): Promise<T> => load(await readFile(path, 'utf8')) as T

function evaluateWorkflowExpression(
  expression: string,
  values: Record<string, string | boolean>,
): string | boolean {
  const source = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '')
  const javascript = source
    .replaceAll('needs.changes.outputs.area-tooling', 'areaTooling')
    .replaceAll('needs.changes.outputs.i18n-route-bounds', 'routeBounds')
    .replaceAll('inputs.run_tooling', 'runTooling')
  return runInNewContext(javascript, {
    areaTooling: values.areaTooling,
    routeBounds: values.routeBounds,
    runTooling: values.runTooling,
  }) as string | boolean
}

describe('i18n route bounds CI selection', () => {
  it('selects the check for catalog, web, analysis, and shared test inputs only', async () => {
    const filters = await readYaml<Record<string, string[]>>('.github/ci-path-filters.yml')
    const patterns = filters['i18n-route-bounds']
    expect(patterns).toBeDefined()

    for (const path of [
      'localization/catalog/en-US/common.json',
      'web/app/login/page.tsx',
      'web/lib/i18n/route-selectors.generated.mts',
      'static-code-analysis/i18n-extract/route-bounds.test.mts',
      'test-helpers/vitest-config/tooling-projects.mts',
      'ci/tooling-test-env.mts',
      'ci/with-node-test-options',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      '.nvmrc',
      'vitest.config.mts',
      'tsconfig.json',
      '.github/ci-path-filters.yml',
    ]) {
      expect(patterns!.some(pattern => picomatch.isMatch(path, pattern))).toBe(true)
    }

    for (const path of ['README.md', 'docs/product-overview.md', 'backend/api/handler.mts']) {
      expect(patterns!.some(pattern => picomatch.isMatch(path, pattern))).toBe(false)
    }
  })

  it.each([
    {
      name: 'a full manual or nightly run',
      env: {
        FULL: 'true',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'false',
      },
      expected: 'true',
    },
    {
      name: 'a route-bounds input change',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'true',
      },
      expected: 'true',
    },
    {
      name: 'an ordinary tooling change',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'false',
        TOOLING: 'true',
      },
      expected: 'false',
    },
    {
      name: 'an unrelated code change',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'false',
      },
      expected: 'false',
    },
    {
      name: 'a docs-only change even if the raw path filter matched',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'true',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'true',
      },
      expected: 'false',
    },
    {
      name: 'a workflow or action change',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'true',
        I18N_ROUTE_BOUNDS: 'false',
      },
      expected: 'true',
    },
  ])('normalizes $name through the real area-selection shell step', async ({ env, expected }) => {
    const workflow = await readYaml<Workflow>('.github/workflows/ci-detect-changes.yml')
    const job = workflow.jobs?.['detect-changes']
    const step = job?.steps?.find(candidate => candidate.id === 'areas')
    expect(step?.run).toBeDefined()
    expect(step?.env?.I18N_ROUTE_BOUNDS).toBe('${{ steps.filter.outputs.i18n-route-bounds }}')
    expect(job?.outputs?.['i18n-route-bounds']).toBe('${{ steps.areas.outputs.i18n-route-bounds }}')
    expect(workflow.on?.workflow_call?.outputs?.['i18n-route-bounds']?.value).toBe(
      '${{ jobs.detect-changes.outputs.i18n-route-bounds }}',
    )

    const scratch = await mkdtemp(join(tmpdir(), 'i18n-route-bounds-selection-'))
    try {
      const outputPath = join(scratch, 'github-output')
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', step!.run!], {
        env: {
          ...process.env,
          GITHUB_OUTPUT: outputPath,
          BACKEND: 'false',
          WEB: 'false',
          CLOUDFLARE_WORKER: 'false',
          LAMBDAS: 'false',
          TOOLING: 'false',
          ...env,
        },
        stdio: 'pipe',
      })
      const outputs = Object.fromEntries(
        (await readFile(outputPath, 'utf8'))
          .trim()
          .split('\n')
          .map(line => line.split('=')),
      )
      expect(outputs['i18n-route-bounds']).toBe(expected)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('routes web-only and catalog-only changes to the bounds job without running broad tooling', async () => {
    const tooling = await readYaml<Workflow>('.github/workflows/tooling.yml')
    const runTooling = tooling.jobs?.['test-tooling']
    expect(runTooling?.if).toBe(
      "needs.changes.outputs.area-tooling == 'true' || needs.changes.outputs.i18n-route-bounds == 'true'",
    )
    expect(runTooling?.with?.run_tooling).toBe(
      "${{ needs.changes.outputs.area-tooling == 'true' }}",
    )
    for (const values of [
      { areaTooling: 'false', routeBounds: 'true', expectedJob: true, expectedTooling: false },
      { areaTooling: 'true', routeBounds: 'false', expectedJob: true, expectedTooling: true },
      { areaTooling: 'false', routeBounds: 'false', expectedJob: false, expectedTooling: false },
    ]) {
      expect(evaluateWorkflowExpression(runTooling!.if!, values)).toBe(values.expectedJob)
      expect(evaluateWorkflowExpression(runTooling!.with!.run_tooling!, values)).toBe(
        values.expectedTooling,
      )
    }

    const tests = await readYaml<Workflow>('.github/workflows/tests-tooling.yml')
    expect(tests.on?.workflow_call.inputs?.run_tooling).toMatchObject({
      type: 'boolean',
      required: false,
      default: true,
    })
    expect(tests.on?.workflow_dispatch.inputs?.run_tooling).toMatchObject({
      type: 'boolean',
      default: true,
    })
    expect(tests.jobs?.tooling?.if).toBe('inputs.run_tooling')
    for (const runToolingValue of [true, false]) {
      expect(
        evaluateWorkflowExpression(tests.jobs!.tooling!.if!, { runTooling: runToolingValue }),
      ).toBe(runToolingValue)
    }
    expect(tests.jobs?.['i18n-route-bounds']?.if).toBeUndefined()

    const coverage = tooling.jobs?.coverage
    expect(coverage?.needs).toContain('changes')
    expect(coverage?.if).toContain("needs.changes.outputs.area-tooling == 'true'")
    expect(coverage?.if).not.toContain('i18n-route-bounds')
  })
})
