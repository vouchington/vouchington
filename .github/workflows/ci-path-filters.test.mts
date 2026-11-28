import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../test-helpers/workflow-fixtures.mts'
import {
  primaryPathFilters,
  runtimePathFilters,
} from '../test-helpers/path-filter-test-fixtures.mts'

type Workflow = {
  jobs?: Record<string, { uses?: string }>
}

type PathFilters = Record<string, string[]>

function loadDetectChangesFilters(): PathFilters {
  return primaryPathFilters
}

function loadRuntimeFilters(): PathFilters {
  return runtimePathFilters
}

function filterMatches(globs: string[] | undefined, path: string, every = false): boolean {
  const matches = (glob: string) => picomatch.isMatch(path, glob)
  return every ? (globs ?? []).every(matches) : (globs ?? []).some(matches)
}

const pr9389Files = [
  '.agents/skills/vouchington-qa/SKILL.md',
  'ci/agent-workflow-docs.test.mts',
] as const

describe('detect-changes path filters', () => {
  it('routes moved shared CI action bodies through the original action selector', () => {
    const shared = loadDetectChangesFilters()['workflow-action-changes']
    for (const path of [
      'ci/build-infra/validate-shared-build-cache-mode.sh',
      'ci/build-infra/validate-restored-web-targets.sh',
      'ci/build-infra/build-web-targets.sh',
      'ci/build-infra/start-valkey.sh',
      'ci/run-repository-static-checks.sh',
      'ci/check-backend-query-profile-manifests.sh',
    ]) {
      expect(filterMatches(shared, path)).toBe(true)
    }
  })

  it('keeps shared build infrastructure scripts in every original main push route', () => {
    const scripts = [
      'validate-shared-build-cache-mode.sh',
      'validate-restored-web-targets.sh',
      'build-web-targets.sh',
      'start-valkey.sh',
    ].map(name => `ci/build-infra/${name}`)
    for (const workflowName of [
      'docs-publish.yml',
      'main-backend.yml',
      'main-web.yml',
      'main-cloudflare-worker.yml',
      'main-lambdas.yml',
      'main-storybook.yml',
    ]) {
      const workflow = load(readFileSync(`.github/workflows/${workflowName}`, 'utf8')) as {
        on?: { push?: { paths?: string[] } }
      }
      for (const script of scripts) {
        expect(filterMatches(workflow.on?.push?.paths, script)).toBe(true)
      }
    }
  })

  it('keeps the backend query-profile wrapper in its main push route', () => {
    const workflow = load(readFileSync('.github/workflows/main-backend.yml', 'utf8')) as {
      on?: { push?: { paths?: string[] } }
    }
    expect(
      filterMatches(workflow.on?.push?.paths, 'ci/check-backend-query-profile-manifests.sh'),
    ).toBe(true)
  })

  it('routes catalog generator sources and their existing owners without all scripts', () => {
    const backend = loadDetectChangesFilters()['backend']
    for (const stem of ['generate-mcp-catalog', 'mcp-catalog-generation', 'mcp-result-fixtures']) {
      expect(filterMatches(backend, `backend/scripts/${stem}.mts`)).toBe(true)
      expect(filterMatches(backend, `backend/scripts/${stem}.test.mts`)).toBe(true)
    }
    expect(filterMatches(backend, 'backend/scripts/unrelated-operation.mts')).toBe(false)
  })

  it('routes the Storybook browser project through every Storybook trigger surface', () => {
    const projectPath = 'test-helpers/vitest-config/storybook-browser-project.mts'
    const mainStorybook = load(readFileSync('.github/workflows/main-storybook.yml', 'utf8')) as {
      on?: { push?: { paths?: string[] } }
    }

    expect(filterMatches(loadDetectChangesFilters().storybook, projectPath)).toBe(true)
    expect(filterMatches(loadRuntimeFilters().storybook, projectPath, true)).toBe(true)
    expect(filterMatches(mainStorybook.on?.push?.paths, projectPath)).toBe(true)
    for (const script of ['preserve-node-lcov', 'preserve-browser-lcov']) {
      expect(
        filterMatches(mainStorybook.on?.push?.paths, `.github/workflows/storybook/${script}.sh`),
      ).toBe(true)
    }
  })

  it('routes extracted checks scripts through their main deployment workflows', () => {
    const staticScripts = [
      '.github/workflows/checks-static-api-snapshot-git-state.sh',
      '.github/workflows/checks-static-backend-contracts.sh',
      '.github/workflows/checks-static-no-next-pages-router.sh',
    ]
    const backendSmokeScripts = [
      '.github/workflows/checks-backend-smoke-allocate-port.sh',
      '.github/workflows/checks-backend-smoke-compile-bun.sh',
    ]
    const pathsByWorkflow: Record<string, string[] | undefined> = {}
    for (const name of [
      'main-backend.yml',
      'main-web.yml',
      'main-cloudflare-worker.yml',
      'main-lambdas.yml',
    ]) {
      const mainWorkflow = load(readFileSync(`.github/workflows/${name}`, 'utf8')) as {
        on?: { push?: { paths?: string[] } }
      }
      pathsByWorkflow[name] = mainWorkflow.on?.push?.paths
    }

    for (const script of staticScripts) {
      for (const paths of Object.values(pathsByWorkflow)) {
        expect(filterMatches(paths, script)).toBe(true)
      }
    }
    for (const script of backendSmokeScripts) {
      expect(filterMatches(pathsByWorkflow['main-backend.yml'], script)).toBe(true)
      for (const name of ['main-web.yml', 'main-cloudflare-worker.yml', 'main-lambdas.yml']) {
        expect(filterMatches(pathsByWorkflow[name], script)).toBe(false)
      }
    }
  })

  it('routes main publication script changes to their owning workflows', () => {
    const publicationScripts = [
      ['main-cloudflare-worker', '.github/workflows/main-cloudflare-worker/build.sh'],
      ['main-lambdas', '.github/workflows/main-lambdas/build.sh'],
      ['main-storybook', '.github/workflows/main-storybook/build.sh'],
    ] as const

    for (const [workflowName, scriptPath] of publicationScripts) {
      const workflow = load(readFileSync(`.github/workflows/${workflowName}.yml`, 'utf8')) as {
        on?: { push?: { paths?: string[] } }
      }

      expect(filterMatches(workflow.on?.push?.paths, scriptPath)).toBe(true)
    }
  })

  it('fails open for filter changes and routes CI control workflows through topology', () => {
    const filterPaths = ['.github/ci-path-filters.yml']
    const areaPaths = ['backend', 'web', 'cloudflare-worker', 'lambdas', 'tooling', 'static'].map(
      area => `.github/workflows/${area}.yml`,
    )
    const workflowPaths = [
      ...new Set(
        areaPaths.flatMap(path => {
          const workflow = load(readFileSync(path, 'utf8')) as Workflow
          return [
            path,
            ...Object.values(workflow.jobs ?? {}).flatMap(job => {
              const reusableWorkflowPath = job.uses?.replace(/^\.\//u, '')
              return reusableWorkflowPath?.startsWith('.github/workflows/ci-')
                ? [reusableWorkflowPath]
                : []
            }),
          ]
        }),
      ),
    ].toSorted()

    for (const [filters, every] of [
      [loadDetectChangesFilters(), false],
      [loadRuntimeFilters(), true],
    ] as const) {
      for (const [name, globs] of Object.entries(filters)) {
        if (name === 'workflow-action-changes') continue
        for (const path of filterPaths) {
          expect(filterMatches(globs, path, every)).toBe(true)
        }
      }
    }

    const filters = loadDetectChangesFilters()
    expect(workflowPaths.length).toBeGreaterThan(0)
    for (const path of workflowPaths) {
      expect(filterMatches(filters.tooling, path)).toBe(true)
      expect(filterMatches(filters['workflow-action-changes'], path)).toBe(true)
    }
  })

  it('selects initialize-smoke inputs and ignores a ci-tools contract test', () => {
    const shellScripts = loadDetectChangesFilters()['shell-scripts']
    const hits = ['dev/initialize', 'dev/lib/db-target.sh', 'ci/download-with-diagnostics.sh']
    const misses = ['ci/agent-workflow-docs.test.mts', 'dev/pr-description/policy.mts']
    assertNoWorkflowViolations(
      hits.filter(path => !filterMatches(shellScripts, path)),
      'shell-scripts misses:',
    )
    assertNoWorkflowViolations(
      misses.filter(path => filterMatches(shellScripts, path)),
      'shell-scripts unexpectedly matches:',
    )
  })

  it('maps the #9389 file set to tooling only', () => {
    const filters = loadDetectChangesFilters()
    for (const path of pr9389Files) {
      // Every path in this set now matches `tooling` directly: the `.agents/skills/**` glob
      // (added to close the no-mistakes affected-test planner gap in #11030) covers the skill
      // docs, and `ci/**` already covered the ci/ file.
      expect(filterMatches(filters.tooling, path)).toBe(true)
      expect(filterMatches(filters['ts-shared'], path)).toBe(false)
      expect(filterMatches(filters['explain-analyze'], path)).toBe(false)
      expect(filterMatches(filters.portability, path)).toBe(false)
      expect(filterMatches(filters['shell-scripts'], path)).toBe(false)
    }
  })
})
