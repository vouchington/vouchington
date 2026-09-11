import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import { githubWorkflowPaths } from './repo-topology.mts'
import { projectToJob } from './vitest/project-ownership-registry.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type TestPlanTrigger =
  | string[]
  | { paths: string[]; targets: string[] }
  | { name: string; paths: string[]; targets?: string[] }

type NoMistakesConfig = {
  ci: {
    actionDirs: string[]
    workflowDirs: string[]
  }
  projects: Record<string, { type: string; root: string }>
  test_plan: Record<
    'playwright' | 'vitest',
    {
      fullSuiteTriggers: {
        ignoreChangedTests?: string[]
        triggers?: TestPlanTrigger[]
        projects?: Record<string, TestPlanTrigger>
      }
    }
  >
}

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

describe('no-mistakes test plan config', () => {
  it('discovers repository-local composite actions for workflow topology queries', () => {
    const config = parseYaml(readRepoFile('.no-mistakes.yml')) as NoMistakesConfig

    expect(config.ci.actionDirs).toEqual(['.github/actions'])
    expect(config.ci.workflowDirs).toEqual(['.github/workflows', 'ci/no-mistakes-workflows'])
  })

  it('keeps runtime topology scoped to executable GitHub workflow roots', () => {
    const paths = githubWorkflowPaths(repoRoot)

    expect(paths).toContain('.github/workflows/ci.yml')
    expect(paths).not.toContain('ci/no-mistakes-workflows/ci-path-coverage.yml')
    expect(paths.every(path => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path))).toBe(true)
  })

  it('enumerates only tracked root workflow descriptors', () => {
    const root = mkdtempSync(join(tmpdir(), 'tracked-workflow-topology-'))
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: root })
      mkdirSync(join(root, '.github/workflows/nested'), { recursive: true })
      writeFileSync(join(root, '.gitignore'), '.github/workflows/ignored.yml\n')
      for (const path of [
        '.github/workflows/tracked.yml',
        '.github/workflows/tracked.yaml',
        '.github/workflows/nested/tracked.yml',
        '.github/workflows/tracked.txt',
        '.github/workflows/untracked.yml',
        '.github/workflows/ignored.yml',
      ]) {
        writeFileSync(join(root, path), 'name: fixture\n')
      }
      execFileSync(
        'git',
        [
          'add',
          '.gitignore',
          '.github/workflows/tracked.yml',
          '.github/workflows/tracked.yaml',
          '.github/workflows/nested/tracked.yml',
          '.github/workflows/tracked.txt',
        ],
        { cwd: root },
      )

      expect(githubWorkflowPaths(root)).toEqual([
        '.github/workflows/tracked.yaml',
        '.github/workflows/tracked.yml',
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('projects the top-level file trigger onto the real external path filters', () => {
    const ci = parseYaml(readRepoFile('.github/workflows/ci.yml')) as {
      on: { pull_request: Record<string, unknown> }
    }
    const projection = parseYaml(readRepoFile('ci/no-mistakes-workflows/ci-path-coverage.yml')) as {
      on: { pull_request: unknown }
      jobs: { 'detect-changes': { steps: Array<{ id?: string; with?: { filters?: string } }> } }
    }
    const pullRequest = ci.on.pull_request
    const filterStep = projection.jobs['detect-changes'].steps.find(step => step.id === 'filter')

    expect(pullRequest).not.toHaveProperty('paths')
    expect(pullRequest).not.toHaveProperty('paths-ignore')
    expect(projection.on).toHaveProperty('pull_request')
    expect(filterStep?.with?.filters).toBe('.github/ci-path-filters.yml')
  })

  it('keeps broad Playwright triggers bounded and framework-specific', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')
    const config = parseYaml(noMistakes) as NoMistakesConfig
    const named = Object.fromEntries(
      (config.test_plan.playwright.fullSuiteTriggers.triggers ?? []).map(trigger => {
        if (Array.isArray(trigger) || !('name' in trigger)) {
          throw new Error('expected named Playwright triggers')
        }
        return [trigger.name, trigger.paths]
      }),
    )
    const projects = config.test_plan.playwright.fullSuiteTriggers.projects ?? {}

    expect(named['root-config']).not.toContain('.no-mistakes.yml')
    expect(named['root-config']).toEqual(
      expect.arrayContaining([
        'package.json',
        'cloudflare-worker/wrangler.local.jsonc',
        'playwright.config.*',
        'playwright/setup/**',
        'ci/test-plan.mts',
      ]),
    )
    expect(projects['ci-playwright']).toEqual(
      expect.arrayContaining(['**', '!**/*.test.*', '!**/__tests__/**']),
    )
    expect(projects['github-actions']).toEqual(
      expect.arrayContaining(['workflows/tests-playwright.yml', 'actions/build-web-targets/**']),
    )
    expect(noMistakes).toMatch(/playwright:[\s\S]*?pullRequest:\s+globalConfigFallback:\s*false/)
    expect(noMistakes).not.toContain('root-config: true')
    expect(config.projects['root-config']).toBeUndefined()
  })

  it('targets dynamic Vitest resources to their owning projects', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')
    const config = parseYaml(noMistakes) as NoMistakesConfig
    const named = Object.fromEntries(
      (config.test_plan.vitest.fullSuiteTriggers.triggers ?? []).map(trigger => {
        if (Array.isArray(trigger) || !('name' in trigger)) {
          throw new Error('expected named Vitest triggers')
        }
        return [trigger.name, trigger]
      }),
    )

    expect(config.projects['workspace-package-boundaries']).toBeUndefined()
    expect(config.test_plan.vitest.fullSuiteTriggers.ignoreChangedTests).toEqual(['vitest'])
    expect(named['root-config']?.paths).toEqual([
      'package.json',
      'vitest.config.mts',
      'test-helpers/vitest-config/**',
    ])
    expect(named['api-contracts']).toEqual({
      name: 'api-contracts',
      paths: [
        'api-fixtures/v1/openapi.json',
        'api-fixtures/v1/schema-lock.json',
        'backend/api/v1/**',
      ],
      targets: ['backend-test-helpers'],
    })
    expect(named['workspace-package-boundaries']).toEqual({
      name: 'workspace-package-boundaries',
      paths: [
        'api-fixtures/package.json',
        'backend/**/*.mts',
        'backend/**/*.ts',
        'backend/**/package.json',
        'ts-shared/**/*.mts',
        'ts-shared/**/*.ts',
        'ts-shared/**/package.json',
        'pnpm-workspace.yaml',
        'static-code-analysis/docker-deploy/**',
      ],
      targets: ['docker-deploy'],
    })
    expect(projectToJob()['docker-deploy']).toBe('test-tooling')
    expect(named['postgres-resources']).toEqual({
      name: 'postgres-resources',
      paths: [
        'backend/data-stores/psql/migrations/**/*.sql',
        'backend/data-stores/psql/config-driven/**/*.sql',
        'backend/data-stores/psql/config-driven/**/*.mts',
      ],
      targets: [
        'backend/analytics-integration',
        'backend-data-stores',
        'backend-postgres-schema',
        'backend-mocks',
        'backend-aws',
        'backend-openai',
        'web-api',
        'web-integration',
      ],
    })
    expect(config.projects['agent-tools-docs']).toBeUndefined()
    expect(named['agent-tools-docs']).toEqual({
      name: 'agent-tools-docs',
      paths: ['docs/overview/architecture/agent-tools/**'],
      targets: ['backend-docs-freshness'],
    })
    expect(config.projects['automation-prompt-docs']).toBeUndefined()
    expect(named['automation-prompt-docs']).toEqual({
      name: 'automation-prompt-docs',
      paths: ['docs/prompts/**'],
      targets: ['github-actions', 'ci-tools', 'dev-tools'],
    })
    expect(config.projects['agent-skill-docs']).toBeUndefined()
    expect(named['agent-skill-docs']).toEqual({
      name: 'agent-skill-docs',
      paths: ['.agents/skills/**'],
      targets: ['github-actions', 'ci-tools', 'dev-tools', 'static-analysis-tools'],
    })
    expect(config.projects['ci-inventory-config']).toBeUndefined()
    expect(named['ci-inventory-config']).toEqual({
      name: 'ci-inventory-config',
      paths: [
        '.no-mistakes.yml',
        '.github/ci-path-filters.yml',
        '.github/workflows/ci-detect-changes.yml',
        '.github/workflows/main-checks.yml',
      ],
      targets: ['github-actions', 'ci-tools'],
    })
    expect(config.projects['worker-queue-policy']).toBeUndefined()
    expect(named['worker-queue-policy']).toBeUndefined()
    expect(noMistakes).toMatch(/vitest:[\s\S]*?pullRequest:\s+globalConfigFallback:\s*false/)
  })

  it('keeps credentialed coarse gates aligned with targeted PostgreSQL triggers', () => {
    const filters = readRepoFile('.github/ci-path-filters.yml')
    const backendCredentialed = filters.match(/\nbackend-credentialed:[\s\S]*?(?=\n\S)/)?.[0]

    expect(backendCredentialed).toContain("- 'backend/data-stores/psql/migrations/**'")
    expect(backendCredentialed).toContain("- 'backend/data-stores/psql/config-driven/**'")
  })
})
