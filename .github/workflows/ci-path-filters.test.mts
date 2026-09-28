import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../test-helpers/workflow-test-helpers.mts'
import {
  primaryPathFilters,
  runtimePathFilters,
} from '../test-helpers/path-filter-test-fixtures.mts'

type Workflow = {
  jobs?: Record<
    string,
    {
      if?: string
      outputs?: Record<string, string>
      steps?: Array<{ id?: string; uses?: string; with?: Record<string, string> }>
      uses?: string
    }
  >
}

type PathFilters = Record<string, string[]>

const detectChangesWorkflow = load(
  readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8'),
) as Workflow

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
  '.agents/skills/agent-workflow/git-and-prs.md',
  '.agents/skills/agent-workflow/start-of-work.md',
  '.agents/skills/review-ci-logs/SKILL.md',
  '.agents/skills/triage-prs/SKILL.md',
  'ci/agent-workflow-docs.test.mts',
] as const

describe('detect-changes path filters', () => {
  it('routes the Storybook browser project through every Storybook trigger surface', () => {
    const projectPath = 'test-helpers/vitest-config/storybook-browser-project.mts'
    const mainStorybook = load(readFileSync('.github/workflows/main-storybook.yml', 'utf8')) as {
      on?: { push?: { paths?: string[] } }
    }

    expect(filterMatches(loadDetectChangesFilters().storybook, projectPath)).toBe(true)
    expect(filterMatches(loadRuntimeFilters().storybook, projectPath, true)).toBe(true)
    expect(filterMatches(mainStorybook.on?.push?.paths, projectPath)).toBe(true)
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
              const path = job.uses?.replace(/^\.\//u, '')
              return path?.startsWith('.github/workflows/ci-') ? [path] : []
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
    expect(filters.tooling).toContain('.github/ci-*.yml')
    for (const path of workflowPaths) {
      expect(filterMatches(filters.tooling, path)).toBe(true)
      expect(filterMatches(filters['workflow-action-changes'], path)).toBe(true)
    }
  })

  it('declares a dedicated portability output that selects the portability suites', () => {
    const portability = loadDetectChangesFilters().portability
    expect(detectChangesWorkflow.jobs?.['detect-changes']?.outputs?.portability).toBe(
      '${{ steps.filter.outputs.portability }}',
    )
    const portabilityTests = [
      'lambdas/dev-server.test.mts',
      'cloudflare-worker/scripts/wrangler/runtime.test.mts',
    ]
    expect(portabilityTests.filter(path => !filterMatches(portability, path))).toEqual([])
    expect(portability).not.toContain('ci/**')
  })

  it('does not treat every ci/ or dev/ file as an initialize-smoke change', () => {
    const shellScripts = loadDetectChangesFilters()['shell-scripts']
    expect(shellScripts).toBeDefined()
    expect(shellScripts).not.toContain('ci/**')
    expect(shellScripts).not.toContain('dev/**')
    expect(shellScripts).not.toContain('static-code-analysis/**')
    expect(shellScripts).toEqual(
      expect.arrayContaining([
        '**/*.sh',
        'dev/initialize*',
        'dev/lib/**',
        'dev/host-storage-preflight.mts',
        'dev/worktree-port-policy.json',
      ]),
    )
  })

  it('selects initialize-smoke inputs and ignores a ci-tools contract test', () => {
    const shellScripts = loadDetectChangesFilters()['shell-scripts']
    const hits = [
      'dev/initialize',
      'dev/lib/db-target.sh',
      'dev/host-storage-preflight.mts',
      'dev/worktree-port-policy.json',
      'ci/download-with-diagnostics.sh',
    ]
    const misses = ['ci/agent-workflow-docs.test.mts', 'dev/pr-description.mts']
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
