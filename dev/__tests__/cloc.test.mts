import { createClassifier, createPathPolicy, normalizeClocConfig } from 'vouchington-tooling/cloc'
import { describe, expect, it } from 'vitest'
import layout from '../cloc.config.json' with { type: 'json' }

const config = normalizeClocConfig(layout)
const classifyFile = createClassifier(config)
const policy = createPathPolicy(config)

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
  // Nested docs → tooling (README.md / AGENTS.md at any depth)
  { path: 'backend/api/README.md', category: 'tooling', service: 'backend' },
  { path: 'web/AGENTS.md', category: 'tooling', service: 'web' },
  { path: 'docs/development/tests.md', category: 'tooling', service: 'docs' },
  // Nested manifests/configs → tooling
  { path: 'backend/agents/story-post/package.json', category: 'tooling', service: 'backend' },
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

describe('Voucha cloc layout', () => {
  it.each(CLASSIFIER_FIXTURES)(
    '$path stays in the configured $service / $category axis',
    ({ path, category, service }) => {
      expect(classifyFile(path)).toEqual({ category, service })
    },
  )

  it('counts only Voucha roots and excludes fixture, snapshot and Worker output trees', () => {
    const paths = [
      'backend/services/posts/index.mts',
      'web/app/page.tsx',
      '.jscpd.json',
      'package.json',
      'articles/news.md',
      'backend/fixtures/seed.mts',
      'backend/__fixtures__/seed.mts',
      'email-templates/__snapshots__/welcome.html',
      'cloudflare-worker/.wrangler/cache/index.mts',
    ]
    const tracked = new Set(paths)
    expect(paths.filter(path => policy.shouldCountFile(path, tracked))).toEqual(paths.slice(0, 4))
    expect(policy.countTargetsFor(tracked)).toEqual([
      'backend',
      'cloudflare-worker',
      'email-templates',
      'web',
      '.jscpd.json',
      'package.json',
    ])
  })
})
