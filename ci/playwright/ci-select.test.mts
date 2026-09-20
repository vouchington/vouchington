import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { isRunnablePlaywrightSpec } from '../test-plan.mts'
import { groupCount, playwrightPlanOptions } from './ci-select.mts'
import {
  playwrightSelectionOutputs,
  playwrightShardTotal,
  runnablePlaywrightSpecCount,
} from './shard-selection.mts'

const src = readFileSync(fileURLToPath(new URL('ci-select.mts', import.meta.url)), 'utf8')

describe('no-mistakes CI Playwright planner', () => {
  it('passes the PR base and HEAD to the revision-aware planner', () => {
    const options = playwrightPlanOptions(process.cwd(), 'release/2026-07')

    expect(options.timeout).toBe(0)
    expect(options.lockTimeout).toBe(0)
    expect(options.base).toBe('origin/release/2026-07')
    expect(options.head).toBe('HEAD')
    expect(options).not.toHaveProperty('diff')
    expect(options).not.toHaveProperty('changedFiles')
    expect(options).not.toHaveProperty('tsconfig')
  })

  it('uses the no-mistakes test-plan adapter instead of local A/B/C selection', () => {
    expect(src).toContain("from '../test-plan.mts'")
    expect(src).toContain("environment: 'pullRequest'")
    expect(src).not.toContain('getNoMistakesPlaywrightRelated')
    expect(src).not.toContain('getDependentsRelated')
    expect(src).not.toContain('seededSample')
  })

  it('keeps test-file filtering in .no-mistakes.yml instead of trimming planner results', () => {
    expect(src).not.toContain('filterExtension')
    expect(src).not.toContain(".endsWith('.spec.mts')")
  })

  it('persists planner JSON and markdown artifacts for reviewability', () => {
    expect(src).toContain('PLAN_JSON_ARTIFACT')
    expect(src).toContain('PLAN_MARKDOWN_ARTIFACT')
    expect(src).toContain('writePlanArtifacts(plan)')
    expect(src).toContain('planCommentSummary(plan.comment)')
  })

  it('does not read PR labels; label-driven full-suite override was removed', () => {
    expect(src).not.toContain('labels.includes')
    expect(src).not.toContain('PR_LABELS')
  })

  it('uses planner fallback results as full-suite selections', () => {
    expect(src).toContain('plan.fallbackTriggered')
    expect(src).toContain('plan.fallbackReason')
  })

  it('falls back to the full suite when the planner throws', () => {
    expect(src).toContain("fullOut('test planner failed'")
    expect(src).toContain('no-mistakes test planner failed')
  })

  it('labels dependency-related groups consistently with the planner output', () => {
    expect(src).toContain('${dependencies} dependencies')
    expect(src).toContain('| Dependency-related |')
    expect(src).not.toContain('${dependencies} dependents')
  })
})

describe('groupCount', () => {
  it('returns selected count for the matching group, counting only runnable Playwright specs', () => {
    expect(
      groupCount(
        [
          {
            type: 'direct',
            selected: ['playwright/tests/admin/admin.spec.mts'],
          },
          {
            type: 'sample',
            selected: ['playwright/tests/foo/bar.spec.mts', 'playwright/tests/baz/qux.spec.mts'],
          },
        ],
        'sample',
      ),
    ).toBe(2)
  })

  it('excludes non-runnable entries such as vitest files and playwright helper tests', () => {
    expect(
      groupCount(
        [
          {
            type: 'dependencies',
            selected: [
              'playwright/tests/real.spec.mts',
              'backend/services/foo/__tests__/foo.test.mts',
              'playwright/helpers/util.test.mts',
            ],
          },
        ],
        'dependencies',
      ),
    ).toBe(1)
  })

  it('returns zero when the group is absent', () => {
    expect(
      groupCount([{ type: 'direct', selected: ['playwright/tests/a.spec.mts'] }], 'coverage'),
    ).toBe(0)
  })
})

describe('playwrightShardTotal', () => {
  it('uses one shard for zero through 25 runnable spec files', () => {
    expect(playwrightShardTotal(0)).toBe(1)
    expect(playwrightShardTotal(1)).toBe(1)
    expect(playwrightShardTotal(25)).toBe(1)
  })

  it('adds a shard as the spec count crosses each execution-budget boundary', () => {
    expect(playwrightShardTotal(26)).toBe(2)
    expect(playwrightShardTotal(50)).toBe(2)
    expect(playwrightShardTotal(51)).toBe(3)
    expect(playwrightShardTotal(75)).toBe(3)
    expect(playwrightShardTotal(76)).toBe(4)
  })

  it('uses a valid explicit override instead of the runtime heuristic', () => {
    expect(playwrightShardTotal(30_721, '4')).toBe(4)
    expect(playwrightShardTotal(1, '256')).toBe(256)
  })

  it.each(['0', '-1', '1.5', ' 4 ', '257', 'not-a-number'])(
    'rejects invalid override %s',
    override => {
      expect(() => playwrightShardTotal(1, override)).toThrow(/Playwright shard-total override/)
    },
  )

  it.each([-1, 1.5, Number.NaN])('rejects invalid runnable spec count %s', specFileCount => {
    expect(() => playwrightShardTotal(specFileCount)).toThrow(
      /runnable Playwright spec count must be a non-negative integer/,
    )
  })

  it('rejects a computed shard total above the GitHub matrix limit', () => {
    expect(() => playwrightShardTotal(30_721)).toThrow(
      /computed Playwright shard total must not exceed 256/,
    )
  })
})

describe('full-suite shard selection', () => {
  it('counts the repository full suite through the runnable Playwright spec predicate', () => {
    const candidates = globSync('playwright/tests/**/*', { cwd: process.cwd() })

    expect(runnablePlaywrightSpecCount(process.cwd())).toBe(
      candidates.filter(isRunnablePlaywrightSpec).length,
    )
    expect(runnablePlaywrightSpecCount(process.cwd())).toBeGreaterThan(0)
  })

  it.each([
    ['manual full run', 'non-PR event (workflow_dispatch)'],
    ['configured full-suite trigger', 'Playwright config changed'],
    ['planner fallback full run', 'dependency graph fallback'],
  ])('returns complete full-suite outputs for a %s', (_scenario, reason) => {
    expect(
      playwrightSelectionOutputs({
        mode: 'full',
        fullSuiteSpecCount: 314,
        reason,
      }),
    ).toEqual({
      skip: 'false',
      fullSuite: 'true',
      files: [],
      shardTotal: '13',
      reason,
    })
  })

  it('returns dynamically sharded outputs for a selected PR', () => {
    const selectedFiles = Array.from(
      { length: 121 },
      (_, index) => `playwright/tests/selected-${index}.spec.mts`,
    )
    const reason = '121 selected specs'

    expect(
      playwrightSelectionOutputs({
        mode: 'selected',
        selectedFiles: [...selectedFiles, 'playwright/helpers/not-runnable.test.mts'],
        reason,
      }),
    ).toEqual({
      skip: 'false',
      fullSuite: 'false',
      files: selectedFiles,
      shardTotal: '5',
      reason,
    })
  })

  it('preserves an empty targeted PR as a one-shard skip with a valid override', () => {
    expect(
      playwrightSelectionOutputs({
        mode: 'selected',
        selectedFiles: ['playwright/helpers/not-runnable.test.mts'],
        reason: 'unused selected reason',
        shardTotalOverride: '4',
      }),
    ).toEqual({
      skip: 'true',
      fullSuite: 'false',
      files: [],
      shardTotal: '1',
      reason: 'skip - no affected tests',
    })
  })
})

describe('revision-aware planner strategy', () => {
  it('uses GITHUB_BASE_REF for the diff base so non-main target branches work correctly', () => {
    expect(src).toContain("process.env['GITHUB_BASE_REF'] || 'main'")
    expect(src).toContain('base: pair2BaseRef(baseBranch)')
  })

  it('leaves revision diff streaming to no-mistakes without local patch buffers or fallbacks', () => {
    expect(src).not.toContain('execFileSync')
    expect(src).not.toContain('DIFF_BUFFER')
    expect(src).not.toContain('CHANGED_FILES_CAP')
    expect(src).not.toContain("'--name-only'")
  })
})
