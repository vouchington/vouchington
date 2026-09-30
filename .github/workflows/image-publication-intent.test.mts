import { readFileSync } from 'node:fs'

import picomatch from 'picomatch'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { runtimePathFilters } from '../test-helpers/path-filter-test-fixtures.mts'

type Step = { id?: string; with?: { filters?: string; 'predicate-quantifier'?: string } }
type Workflow = {
  jobs?: Record<string, { outputs?: Record<string, string>; steps?: Step[] }>
  on?: { push?: { paths?: string[] } }
}

function matches(filterName: 'build-backend' | 'build-web', paths: string[]): boolean {
  const globs = runtimePathFilters[filterName]
  if (!globs) throw new Error(`missing ${filterName} path filter`)
  return paths.some(path => globs.every(glob => picomatch.isMatch(path, glob, { dot: true })))
}

function detectionContract(path: string) {
  const workflow = load(readFileSync(path, 'utf8')) as Workflow
  const detect = workflow.jobs?.['detect-image-publication']
  const step = detect?.steps?.find(candidate => candidate.id === 'image-paths')
  return {
    filters: step?.with?.filters,
    output: detect?.outputs?.publish,
    predicateQuantifier: step?.with?.['predicate-quantifier'],
  }
}

function mainTriggerMatches(group: 'backend' | 'web', path: string): boolean {
  const main = load(readFileSync(`.github/workflows/main-${group}.yml`, 'utf8')) as Workflow
  return (main.on?.push?.paths ?? []).some(glob => picomatch.isMatch(path, glob, { dot: true }))
}

describe('image publication intent', () => {
  it.each([
    ['pnpm-lock.yaml', true, true],
    ['backend/services/example.mts', true, false],
    ['localization/catalog/en.json', true, false],
    ['static-code-analysis/docker-deploy/prune-deployed-runtime-deps.mts', true, false],
    ['web/app/page.tsx', false, true],
    ['.dockerignore', true, true],
    ['backend/services/example.test.mts', false, false],
    ['web/app/page.test.tsx', false, false],
    ['backend/README.md', false, false],
    ['web/README.md', false, false],
    ['ci/resolve-published-images.sh', true, true],
    ['ci/resolve-published-images.test.mts', false, false],
    ['.github/workflows/publish-backend-images.yml', true, false],
    ['.github/workflows/publish-web-images.yml', false, true],
  ])('classifies %s identically for queue and main publication', (path, backend, web) => {
    expect(matches('build-backend', [path])).toBe(backend)
    expect(matches('build-web', [path])).toBe(web)
    expect(!backend || mainTriggerMatches('backend', path)).toBe(true)
    expect(!web || mainTriggerMatches('web', path)).toBe(true)
  })

  it('keeps cumulative queue changes without letting test-only entries request fallback', () => {
    const changed = ['backend/services/example.test.mts', 'web/app/page.tsx']
    expect(matches('build-backend', changed)).toBe(false)
    expect(matches('build-web', changed)).toBe(true)
  })

  it.each(['backend', 'web'] as const)('uses the shared dorny filter owner in main-%s', group => {
    expect(detectionContract(`.github/workflows/main-${group}.yml`)).toEqual({
      filters: '.github/ci-path-filters.yml',
      output: expect.stringContaining('steps.image-paths.outputs'),
      predicateQuantifier: 'every',
    })
  })
})
