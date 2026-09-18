import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { toolingWorkflowProjectNames } from '../../test-helpers/vitest-config/tooling-project-registry.mts'

interface Workflow {
  jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
}

function workflowFiles(): Array<{ contents: string; path: string }> {
  return readdirSync('.github/workflows')
    .filter(path => path.endsWith('.yml') || path.endsWith('.yaml'))
    .map(path => ({ contents: readFileSync(`.github/workflows/${path}`, 'utf8'), path }))
}

function workflowCommands(): Array<{ command: string; location: string }> {
  return workflowFiles().flatMap(({ contents, path }) => {
    const workflow = load(contents) as Workflow
    return Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      (job.steps ?? []).flatMap(step =>
        step.run === undefined
          ? []
          : [{ command: step.run, location: `${path}#${jobName}:${step.name ?? 'unnamed'}` }],
      ),
    )
  })
}

describe('durable Vitest workflow commands', () => {
  it('keeps workflow touch-set validation in the canonical checklist', () => {
    const command = 'pnpm exec vitest run --project github-actions'
    const checklist = readFileSync('docs/checklists/github-actions.md', 'utf8')
    const scopedRules = readFileSync('.github/workflows/CLAUDE.md', 'utf8')

    expect(checklist).toContain(`\`${command}\``)
    expect(scopedRules).toContain('../../docs/checklists/github-actions.md#checklist')
    expect(scopedRules).not.toContain(command)
  })

  it('selects reusable suites by project instead of individual test files', () => {
    const fileFilter = /(?:^|\s)[^\s]+\.(?:mock\.)?test\.[cm]?[jt]sx?(?:\s|$)/
    const violations = workflowCommands()
      .filter(({ command }) => command.includes('vitest run') && fileFilter.test(command))
      .map(({ location }) => location)

    expect(violations).toEqual([])
  })

  it('only enables coverage instrumentation for publishing workflows', () => {
    const conditionalCoverageWorkflows = [
      'tests-backend-modules.yml',
      'tests-backend-credentialed.yml',
      'tests-tooling.yml',
      'tests-ts-shared.yml',
      'tests-portability.yml',
      'tests-lambdas.yml',
      'tests-cloudflare-worker.yml',
      'tests-web.yml',
      'tests-web-api.yml',
      'tests-web-integration.yml',
    ]
    const coverageGate =
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}"

    for (const file of conditionalCoverageWorkflows) {
      const workflow = readFileSync(`.github/workflows/${file}`, 'utf8')
      expect(workflow).toContain(coverageGate)
      expect(workflow).not.toMatch(/(?:vitest run|test:portability).*--coverage/)
    }
  })

  it('keeps split project ownership in the intended workflows', () => {
    const tooling = readFileSync('.github/workflows/tests-tooling.yml', 'utf8')
    expect(tooling).toContain('tooling-test-runner.mts --workflow-projects')
    expect(toolingWorkflowProjectNames).toContain('static-analysis-ast-grep')

    const portability = readFileSync('.github/workflows/tests-portability.yml', 'utf8')
    expect(portability.match(/pnpm run test:portability -- --bail=3/g)).toHaveLength(2)
    expect(portability).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(portability).toContain("- 'lambdas/dev-server.test.mts'")
    expect(portability).toContain("- 'cloudflare-worker/scripts/wrangler/runtime.test.mts'")
    expect(portability).not.toContain("- 'ci/**'")
    expect(portability).not.toContain("- '.agents/skills/retrospective/SKILL.md'")

    const projectGroups = readFileSync('ci/run-vitest-project-group.mts', 'utf8')
    for (const project of ['lambdas-portability', 'cloudflare-worker-portability']) {
      expect(projectGroups).toContain(`'${project}'`)
    }

    const storybook = readFileSync('.github/workflows/storybook.yml', 'utf8')
    expect(storybook).toContain('--project web-storybook-component-coverage')
    expect(storybook).toContain(
      "STORYBOOK_BROWSER_COVERAGE: ${{ inputs.publish_coverage && '1' || '0' }}",
    )
  })

  it('installs the full workspace for both portability jobs', () => {
    const portability = readFileSync('.github/workflows/tests-portability.yml', 'utf8')
    expect(portability.match(/uses: \.\/\.github\/actions\/setup-node-pnpm/g)).toHaveLength(2)
    expect(portability).not.toContain('pnpm install ')
  })

  it('routes web project-config changes to both owning workflow families', () => {
    const configPath = 'test-helpers/vitest-config/web-projects.mts'
    expect(readFileSync('.github/ci-path-filters.yml', 'utf8')).toContain(configPath)
    for (const workflowPath of ['main-web.yml', 'main-storybook.yml']) {
      expect(readFileSync(`.github/workflows/${workflowPath}`, 'utf8')).toContain(configPath)
    }
  })
})
