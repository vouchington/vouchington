import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from './workflow-test-helpers.mts'

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
const ciWorkflow = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow
const mainChecks = load(readFileSync('.github/workflows/main-checks.yml', 'utf8')) as {
  on?: { push?: { paths?: string[] } }
  jobs?: Record<
    string,
    {
      if?: string
      needs?: string[]
      steps?: Array<{
        id?: string
        uses?: string
        with?: { filters?: string; 'fetch-depth'?: string }
      }>
    }
  >
}

function loadDetectChangesFilters(): PathFilters {
  return load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as PathFilters
}

function loadRuntimeFilters(): PathFilters {
  return load(readFileSync('.github/ci-runtime-path-filters.yml', 'utf8')) as PathFilters
}

function loadMainChecksFilters(): PathFilters {
  const filterStep = mainChecks.jobs?.['select-main-checks']?.steps?.find(
    step => step.id === 'filter',
  )
  return load(filterStep?.with?.filters ?? '') as PathFilters
}

function filterMatches(globs: string[] | undefined, path: string, every = false): boolean {
  const matches = (glob: string) => picomatch.isMatch(path, glob)
  return every ? (globs ?? []).every(matches) : (globs ?? []).some(matches)
}

function probePath(glob: string): string {
  const relative = glob.startsWith('**/') ? `probe/${glob.slice(3)}` : glob
  return relative.replaceAll('**', 'nested').replaceAll('*', 'x')
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
    const filterPaths = ['.github/ci-path-filters.yml', '.github/ci-runtime-path-filters.yml']
    const workflowPaths = [
      ...Object.values(ciWorkflow.jobs ?? {}).flatMap(job => {
        const path = job.uses?.replace(/^\.\//u, '')
        return path?.startsWith('.github/workflows/ci-') ? [path] : []
      }),
      '.github/workflows/ci.yml',
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

  it('declares a dedicated portability output', () => {
    expect(detectChangesWorkflow.jobs?.['detect-changes']?.outputs?.portability).toBe(
      '${{ steps.filter.outputs.portability }}',
    )
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

describe('main-checks per-job selection', () => {
  it('keeps on.push.paths covering every select-main-checks group glob', () => {
    const union = mainChecks.on?.push?.paths ?? []
    const uncovered = [...new Set(Object.values(loadMainChecksFilters()).flat())].filter(
      glob => !union.includes(glob) && !filterMatches(union, probePath(glob)),
    )
    expect(uncovered).toEqual([])
    expect(filterMatches(union, 'test-helpers/vitest-config/environment.mts')).toBe(true)
  })

  it('fail-opens each suite when the selector does not emit false', () => {
    for (const job of ['tooling-tests', 'ts-shared-tests', 'explain-analyze']) {
      const suite = mainChecks.jobs?.[job]
      expect(suite?.needs).toEqual(['select-main-checks'])
      expect(suite?.if).toContain('!cancelled()')
      expect(suite?.if).toMatch(/needs\.select-main-checks\.outputs\.\S+ != 'false'/)
    }
  })

  it('checks out enough history for dorny to diff a push', () => {
    const select = mainChecks.jobs?.['select-main-checks']
    const checkout = select?.steps?.find(step => step.uses?.startsWith('actions/checkout@'))
    const filter = select?.steps?.find(step => step.id === 'filter')
    expect([0, 2, '0', '2']).toContain(checkout?.with?.['fetch-depth'])
    const ciPin = readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8').match(
      /dorny\/paths-filter@[0-9a-f]{40}/u,
    )?.[0]
    expect(ciPin).toBeDefined()
    expect(filter?.uses).toBe(ciPin)
  })

  it('keeps workspace-boundary sources on the tooling group', () => {
    const tooling = loadMainChecksFilters().tooling
    expect(tooling).toEqual(
      expect.arrayContaining([
        'api-fixtures/package.json',
        'backend/**',
        'pnpm-workspace.yaml',
        'ts-shared/**',
        'static-code-analysis/**',
      ]),
    )
  })

  it('does not start ts-shared or explain-analyze for the #9389 file set', () => {
    const filters = loadMainChecksFilters()
    for (const path of pr9389Files) {
      // Every path in this set now matches `tooling` directly: the `.agents/skills/**` glob
      // (added to close the no-mistakes affected-test planner gap in #11030) covers the skill
      // docs, and `ci/**` already covered the ci/ file.
      expect(filterMatches(filters.tooling, path)).toBe(true)
      expect(filterMatches(filters['ts-shared'], path)).toBe(false)
      expect(filterMatches(filters['explain-analyze'], path)).toBe(false)
    }
  })

  it('splits #9250 tooling coverage from explain-analyze sources', () => {
    const filters = loadMainChecksFilters()
    expect(filterMatches(filters.tooling, 'backend/package.json')).toBe(true)
    expect(filterMatches(filters['ts-shared'], 'backend/package.json')).toBe(false)
    expect(filterMatches(filters['explain-analyze'], 'backend/package.json')).toBe(false)
    expect(filterMatches(filters.tooling, 'backend/api/foo.mts')).toBe(true)
    expect(filterMatches(filters['explain-analyze'], 'backend/api/foo.mts')).toBe(false)
    expect(filterMatches(filters.tooling, 'backend/services/foo.mts')).toBe(true)
    expect(filterMatches(filters['explain-analyze'], 'backend/services/foo.mts')).toBe(true)
    expect(filterMatches(filters['ts-shared'], 'backend/services/foo.mts')).toBe(false)
    expect(
      filterMatches(filters['explain-analyze'], 'backend/data-stores/psql/migrations/foo.sql'),
    ).toBe(true)
    expect(
      filterMatches(filters['explain-analyze'], 'backend/scripts/explain-analyze/run.mts'),
    ).toBe(true)
  })
})
