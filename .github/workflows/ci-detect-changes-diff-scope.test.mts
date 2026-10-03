import { readFileSync } from 'node:fs'

import picomatch from 'picomatch'
import { parse as load } from 'yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type Files, TopologyRepo } from '../test-helpers/detect-changes-topology.fixtures.mts'
import { runtimePathFilters } from '../test-helpers/path-filter-test-fixtures.mts'

// Each change-detection consumer has one intended diff scope (docs/development/reference-ci-ci-job-conditions.md):
// PR docs-only is the layer (this file), merge-group docs-only is the combined queued range, and
// patch coverage is the layer through HEAD^1.
const rootFiles: Files = {
  'README.md': 'root\n',
  'CHANGELOG.md': 'root\n',
  'web/README.md': 'web\n',
  'docs/guide.md': 'guide\n',
  'backend/shared.mts': 'export const base = 0\n',
}
const lowerBackend: Files = {
  'backend/lower.mts': 'export const lower = true\n',
  'backend/shared.mts': 'export const base = 0\nexport const lower = 1\n',
}
const upperDocs: Files = { 'docs/guide.md': 'upper\n' }

let repo: TopologyRepo
function useRepo(): void {
  beforeEach(() => {
    repo = new TopologyRepo(rootFiles)
  })
  afterEach(() => repo.dispose())
}

describe('PR docs-only classification on a native stack', () => {
  useRepo()

  it('encodes the hosted topology and shows the base-ref range would charge the lower layer', () => {
    const stack = repo.stack(repo.root, lowerBackend, upperDocs)

    expect(repo.git('rev-parse', 'HEAD^1')).toBe(stack.lowerTestMerge)
    expect(repo.git('rev-parse', 'HEAD^2')).toBe(stack.upperHead)
    expect(repo.changed('HEAD^1..HEAD')).toEqual(['docs/guide.md'])
    expect(repo.changed('origin/main...HEAD')).toEqual([
      'backend/lower.mts',
      'backend/shared.mts',
      'docs/guide.md',
    ])
  })

  it.each([
    { name: 'a docs-only layer above lower code', upper: upperDocs, expected: 'true' },
    {
      name: 'a web/README.md-only layer above lower code',
      upper: { 'web/README.md': 'x\n' },
      expected: 'true',
    },
    {
      name: 'a web code layer above lower backend code',
      upper: { 'web/page.tsx': 'x\n' },
      expected: 'false',
    },
    {
      name: 'a layer mixing docs and code',
      upper: { 'docs/guide.md': 'x\n', 'web/page.tsx': 'x\n' },
      expected: 'false',
    },
  ])('classifies $name from the layer alone', ({ upper, expected }) => {
    repo.stack(repo.root, lowerBackend, upper)
    expect(repo.docsOnly()).toBe(expected)
  })

  it('classifies a code layer above a lower docs layer as code', () => {
    repo.stack(repo.root, upperDocs, { 'backend/upper.mts': 'x\n' })
    expect(repo.docsOnly()).toBe('false')
  })

  it('skips the web area for an upper web/README.md layer, as for a non-stacked PR', () => {
    repo.stack(repo.root, lowerBackend, { 'web/README.md': 'x\n' })
    const matchesRuntimeWeb = runtimePathFilters.web!.every(glob =>
      picomatch.isMatch('web/README.md', glob),
    )
    const areas = repo.runStep('Resolve area selection', {
      FULL: 'false',
      DOCS_ONLY: repo.docsOnly()!,
      WORKFLOW_ACTION_CHANGES: 'false',
      BACKEND: 'false',
      WEB: String(matchesRuntimeWeb),
      CLOUDFLARE_WORKER: 'false',
      LAMBDAS: 'false',
      TOOLING: 'false',
    })

    expect(matchesRuntimeWeb).toBe(true)
    expect(areas['web']).toBe('false')
  })

  it('classifies the upper layer alone once the lower layer lands by squash', () => {
    const lowerHead = repo.commitOn(repo.root, lowerBackend, 'lower layer')
    const upperHead = repo.commitOn(lowerHead, upperDocs, 'upper layer')
    const landed = repo.commitOn(repo.root, lowerBackend, 'squash-landed lower layer')
    repo.checkout(repo.merge(landed, upperHead), landed)

    expect(repo.changed('HEAD^1..HEAD')).toEqual(['docs/guide.md'])
    expect(repo.docsOnly()).toBe('true')
  })

  it('classifies the upper layer alone after the stack rebases onto a newer main', () => {
    const moved = repo.commitOn(repo.root, { 'CHANGELOG.md': 'moved\n' }, 'main moves')
    repo.stack(moved, lowerBackend, upperDocs)

    expect(repo.changed('HEAD^1..HEAD')).toEqual(['docs/guide.md'])
    expect(repo.docsOnly()).toBe('true')
  })

  it.each([
    { name: 'docs', files: upperDocs, expected: 'true' },
    { name: 'code', files: { ...upperDocs, 'web/page.tsx': 'x\n' }, expected: 'false' },
  ])(
    'classifies a non-stacked $name PR exactly as the base-ref range did',
    ({ files, expected }) => {
      const head = repo.commitOn(repo.root, files, 'pull request')
      const moved = repo.commitOn(repo.root, { 'CHANGELOG.md': 'moved\n' }, 'main moves on')
      repo.checkout(repo.merge(repo.root, head), moved)

      expect(repo.changed('HEAD^1..HEAD')).toEqual(repo.changed('origin/main...HEAD'))
      expect(repo.docsOnly()).toBe(expected)
    },
  )
})

describe('merge group docs-only classification', () => {
  useRepo()

  function queue(...entries: Files[]): void {
    let tip = repo.root
    for (const files of entries) tip = repo.commitOn(tip, files, 'queue entry')
    repo.checkout(tip, repo.root)
  }

  it('keeps the combined queued range, so earlier code entries make a docs entry code', () => {
    queue(lowerBackend, { 'web/page.tsx': 'x\n' }, upperDocs)

    expect(repo.changed('HEAD^1..HEAD')).toEqual(['docs/guide.md'])
    expect(repo.changed('origin/main..HEAD')).toHaveLength(4)
    expect(repo.mergeGroupDocsOnly()).toBe('false')
  })

  it('is docs-only only when every queued entry is docs', () => {
    queue(upperDocs, { 'web/README.md': 'x\n' })
    expect(repo.mergeGroupDocsOnly()).toBe('true')
  })
})

describe('patch coverage on a native stack', () => {
  useRepo()

  it('derives its base from the merge first parent, so only the layer lines are patch lines', () => {
    const upperLine = 'export const base = 0\nexport const lower = 1\nexport const upper = 2\n'
    repo.stack(repo.root, lowerBackend, { 'backend/shared.mts': upperLine })
    const added = (range: string) =>
      repo
        .git('diff', '-U0', range)
        .split('\n')
        .filter(line => /^\+[^+]/.test(line))
    const workflow = load(readFileSync('.github/workflows/ci-area-coverage.yml', 'utf8')) as {
      jobs: { coverage: { steps: Array<{ with?: Record<string, unknown>; run?: string }> } }
    }
    const steps = workflow.jobs.coverage.steps

    expect(added('HEAD^1..HEAD')).toEqual(['+export const upper = 2'])
    expect(added('origin/main...HEAD')).toEqual([
      '+export const lower = true',
      '+export const lower = 1',
      '+export const upper = 2',
    ])
    expect(steps.some(step => step.run?.includes('git rev-parse HEAD^1'))).toBe(true)
    expect(
      Number(steps.find(step => step.with?.['fetch-depth'])?.with?.['fetch-depth']),
    ).toBeGreaterThanOrEqual(2)
  })
})
