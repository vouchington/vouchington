import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { buildRows, classifyFile, countFiles, formatRows, shouldCountFile } from '../cloc/lib.mts'
import { countTargetsFor, excludedDirs } from '../cloc/paths.mts'

// ---------------------------------------------------------------------------
// Representative paths covering every edge class from PR #5410.
// ---------------------------------------------------------------------------
const CLASSIFIER_FIXTURES: ReadonlyArray<{
  path: string
  category: 'source' | 'tests' | 'tooling'
  service:
    | 'backend'
    | 'web'
    | 'cloudflare-worker'
    | 'lambdas'
    | 'email-templates'
    | 'ts-shared'
    | 'infra'
    | 'tooling'
    | 'docs'
}> = [
  // Config JSON → tooling (special-cased basenames)
  { path: 'web/components.json', category: 'tooling', service: 'web' },
  { path: 'backend/agents/.oxlintrc.json', category: 'tooling', service: 'backend' },
  { path: 'renovate.json', category: 'tooling', service: 'tooling' },
  { path: '.jscpd.json', category: 'tooling', service: 'tooling' },
  // Runtime/data JSON → source (not a config-JSON basename)
  { path: 'api-fixtures/v1/client-intents.json', category: 'source', service: 'tooling' },
  // Nested docs → tooling (README.md / CLAUDE.md at any depth)
  { path: 'backend/api/README.md', category: 'tooling', service: 'backend' },
  { path: 'web/CLAUDE.md', category: 'tooling', service: 'web' },
  { path: 'docs/development/tests.md', category: 'tooling', service: 'docs' },
  // Nested manifests/configs → tooling
  { path: 'backend/agents/chat/package.json', category: 'tooling', service: 'backend' },
  { path: 'backend/tsconfig.json', category: 'tooling', service: 'backend' },
  // Playwright helpers (non-spec) → tests / web service
  { path: 'playwright/helpers/auth.mts', category: 'tests', service: 'web' },
  // Integration tests → tests / web service
  {
    path: 'integration-tests/web-api/__tests__/routes.public.test.mts',
    category: 'tests',
    service: 'web',
  },
  // test-helpers directory → tooling (not tests)
  {
    path: 'cloudflare-worker/test-helpers/src/cache.mts',
    category: 'tooling',
    service: 'cloudflare-worker',
  },
  // Per-service source files
  { path: 'backend/services/posts/index.mts', category: 'source', service: 'backend' },
  { path: 'web/app/page.tsx', category: 'source', service: 'web' },
  { path: 'cloudflare-worker/src/index.mts', category: 'source', service: 'cloudflare-worker' },
  { path: 'lambdas/image-resize/index.mts', category: 'source', service: 'lambdas' },
  { path: 'email-templates/community-invite.tsx', category: 'source', service: 'email-templates' },
  { path: 'ts-shared/utils/index.mts', category: 'source', service: 'ts-shared' },
  // Infra and repo-tooling fallthrough
  { path: 'monitors/uptime.mts', category: 'tooling', service: 'infra' },
  { path: 'ci/ci-local.mts', category: 'tooling', service: 'tooling' },
  { path: 'package.json', category: 'tooling', service: 'tooling' },
]

describe('dev/cloc', () => {
  const sccBinaries: string[] = []

  afterEach(async () => {
    delete process.env.SCC_BIN
    await Promise.all(sccBinaries.splice(0).map(path => rm(path, { force: true, recursive: true })))
  })

  it('counts one physical CSV row with a tracked path and safe code total', async () => {
    const bin = await mkdtemp(join(tmpdir(), 'voucha-cloc-scc-'))
    sccBinaries.push(bin)
    const scc = join(bin, 'scc')
    await writeFile(
      scc,
      "#!/usr/bin/env bash\nprintf 'language,files,blank,comment,code\nTypeScript,dev/cloc/lib.mts,0,0,17\n'\n",
    )
    await chmod(scc, 0o755)
    process.env.SCC_BIN = scc

    await expect(countFiles()).resolves.toEqual([{ code: 17, path: 'dev/cloc/lib.mts' }])
  })

  // -------------------------------------------------------------------------
  // Table-driven classifier covering all edge classes from PR #5410.
  // -------------------------------------------------------------------------
  it.each(CLASSIFIER_FIXTURES)(
    'classifyFile($path) → { category: $category, service: $service }',
    ({ path, category, service }) => {
      expect(classifyFile(path)).toEqual({ category, service })
    },
  )

  // -------------------------------------------------------------------------
  // Synthetic paths for extra coverage of category precedence.
  // -------------------------------------------------------------------------
  it('classifies tests before tooling and source (synthetic paths)', () => {
    expect(classifyFile('dev/__tests__/cloc.test.mts')).toEqual({
      category: 'tests',
      service: 'tooling',
    })
    expect(classifyFile('web/__tests__/home.test.tsx')).toEqual({
      category: 'tests',
      service: 'web',
    })
    expect(classifyFile('playwright/tests/home.spec.ts')).toEqual({
      category: 'tests',
      service: 'web',
    })
    expect(classifyFile('backend/services/posts/index.test.mts')).toEqual({
      category: 'tests',
      service: 'backend',
    })
    expect(classifyFile('README.md')).toEqual({ category: 'tooling', service: 'docs' })
  })

  // -------------------------------------------------------------------------
  // shouldCountFile: count-exclusion policy.
  // -------------------------------------------------------------------------
  it('shouldCountFile excludes fixtures and __snapshots__ sub-trees', () => {
    const tracked = new Set([
      'backend/counted.mts',
      'backend/__fixtures__/data.json',
      'backend/fixtures/seed.mts',
      'email-templates/__snapshots__/welcome.html',
      'fixtures/raw.mts',
    ])
    expect(shouldCountFile('backend/counted.mts', tracked)).toBe(true)
    expect(shouldCountFile('backend/__fixtures__/data.json', tracked)).toBe(false)
    expect(shouldCountFile('backend/fixtures/seed.mts', tracked)).toBe(false)
    expect(shouldCountFile('email-templates/__snapshots__/welcome.html', tracked)).toBe(false)
    expect(shouldCountFile('fixtures/raw.mts', tracked)).toBe(false)
  })

  it('shouldCountFile excludes untracked and off-allowlist files', () => {
    const tracked = new Set(['backend/counted.mts', 'articles/news.md'])
    expect(shouldCountFile('backend/not-tracked.mts', tracked)).toBe(false)
    // 'articles/' is not in countedRoots → isCountedPath returns false
    expect(shouldCountFile('articles/news.md', tracked)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // countTargetsFor: scan-target policy.
  // -------------------------------------------------------------------------
  it('countTargetsFor returns only matching counted roots — never . or off-allowlist', () => {
    const files = new Set([
      'backend/services/posts/index.mts',
      'web/app/page.tsx',
      'package.json',
      '.jscpd.json',
      'articles/news.md', // off-allowlist
    ])
    const targets = countTargetsFor(files)
    expect(targets).toContain('backend')
    expect(targets).toContain('web')
    expect(targets).toContain('package.json')
    expect(targets).toContain('.jscpd.json')
    expect(targets).not.toContain('.')
    expect(targets).not.toContain('articles')
  })

  it('countTargetsFor omits counted roots with no tracked files', () => {
    const files = new Set(['backend/services/posts/index.mts'])
    const targets = countTargetsFor(files)
    expect(targets).toContain('backend')
    expect(targets).not.toContain('web')
    expect(targets).not.toContain('cloudflare-worker')
    expect(targets).not.toContain('monitors')
  })

  // -------------------------------------------------------------------------
  // excludedDirs export is consumed by tests — assert it is non-empty and
  // contains the core exclusions.
  // -------------------------------------------------------------------------
  it('excludedDirs includes core build and dependency output directories', () => {
    expect(excludedDirs).toContain('node_modules')
    expect(excludedDirs).toContain('.next')
    expect(excludedDirs).toContain('dist')
    expect(excludedDirs.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Row building and table formatting.
  // -------------------------------------------------------------------------
  it('builds service rows and totals', () => {
    const rows = buildRows([
      { code: 10, path: 'backend/services/posts/index.mts' },
      { code: 3, path: 'backend/services/posts/index.test.mts' },
      { code: 5, path: 'web/app/page.tsx' },
      { code: 7, path: 'dev/cloc.mts' },
      { code: 2, path: 'dev/__tests__/cloc.test.mts' },
      { code: 4, path: 'monitors/uptime.mts' },
      { code: 6, path: 'README.md' },
    ])

    expect(rows.find(row => row.service === 'backend')).toMatchObject({
      source: 10,
      tests: 3,
      tooling: 0,
      total: 13,
    })
    expect(rows.find(row => row.service === 'web')).toMatchObject({
      source: 5,
      tests: 0,
      tooling: 0,
      total: 5,
    })
    expect(rows.find(row => row.service === 'infra')).toMatchObject({
      source: 0,
      tests: 0,
      tooling: 4,
      total: 4,
    })
    expect(rows.find(row => row.service === 'tooling')).toMatchObject({
      source: 0,
      tests: 2,
      tooling: 7,
      total: 9,
    })
    expect(rows.find(row => row.service === 'docs')).toMatchObject({
      source: 0,
      tests: 0,
      tooling: 6,
      total: 6,
    })
    expect(rows.at(-1)).toEqual({
      service: 'total',
      source: 15,
      tests: 5,
      tooling: 17,
      total: 37,
    })
  })

  it('formats a stable table', () => {
    expect(
      formatRows([
        { service: 'backend', source: 10, tests: 3, tooling: 0, total: 13 },
        { service: 'total', source: 10, tests: 3, tooling: 0, total: 13 },
      ]),
    ).toBe(
      [
        'service  source  tests  tooling  total',
        '-------  ------  -----  -------  -----',
        'backend      10      3        0     13',
        'total        10      3        0     13',
      ].join('\n'),
    )
  })
})
