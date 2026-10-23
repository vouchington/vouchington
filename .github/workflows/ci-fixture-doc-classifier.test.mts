import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import { trackedFiles } from '../../ci/tracked-files.mts'
import { LIVING_DOCS_PIN_CASES } from '../../static-code-analysis/repo-file-policy/living-docs-pin-guard.mts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const CI_DETECT_CHANGES = '.github/workflows/ci-detect-changes.yml'

// The workflow file is the single source of truth for the pattern; extracting it here means
// there is exactly one copy in the repo instead of two kept in sync by hand.
const patternMatch = /TEST_FIXTURE_DOCS=\$\(echo "\$CHANGED" \| grep -E '([^']+)'/.exec(
  readFileSync(CI_DETECT_CHANGES, 'utf8'),
)
if (patternMatch === null) {
  throw new Error(`${CI_DETECT_CHANGES}: TEST_FIXTURE_DOCS grep line not found`)
}
const testFixtureDocsPattern = patternMatch[1]

// Whole trees where every markdown file is read by a Vitest test at runtime (globbed
// directories, not enumerated pages) -- see docs/prompts/README.md for the read-coverage
// argument. `docsOnly()` must never classify a file under these trees as docs-only, or a
// PR touching only one of them skips test-tooling entirely.
const FIXTURE_DOC_TREES = ['.agents/skills', 'docs/prompts'] as const

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

function toolingFilter(): string[] {
  return parseYaml(readRepoFile('.github/ci-path-filters.yml')).tooling
}

const fixtureDocumentationPaths = [
  '.github/workflows/README.md',
  '.github/workflows/AGENTS.md',
  'AGENTS.md',
  'docs/development/ci.md',
  'docs/development/reference-ci-ci-job-conditions.md',
  'docs/checklists/github-actions.md',
  'docs/development/dependency-updates.md',
  'docs/development/reference-dependency-updates-supply-chain-policy.md',
  'docs/development/local-development/reference-bedrock-embeddings-local.md',
  'docs/development/local-development/README.md',
  'docs/overview/architecture/backend/README.md',
  'backend/agents/AGENTS.md',
  'docs/overview/architecture/ai-agents/README.md',
  'docs/development/postgresql/reference-migrations-views-and-config-driven.md',
  'docs/development/postgresql/schema-snapshot/README.md',
  'docs/overview/architecture/mcp/catalog.md',
  'docs/overview/architecture/mcp/README.md',
  'docs/overview/infrastructure/reference-deployment-ci-cd-flow.md',
]

function docsOnly(changedFiles: string[]): boolean {
  if (changedFiles.length === 0) return false

  const nonDocs = changedFiles.filter(path => !/\.mdx?$/.test(path))
  const testFixtureDocs = changedFiles.filter(path => new RegExp(testFixtureDocsPattern).test(path))

  return nonDocs.length === 0 && testFixtureDocs.length === 0
}

describe('CI fixture documentation classifier', () => {
  it('keeps ordinary docs-only changes skipped but runs tests for documented fixtures', () => {
    expect(docsOnly([])).toBe(false)
    expect(docsOnly(['docs/development/tests.md'])).toBe(true)
    expect(docsOnly(['docs/development/tests.md', 'docs/README.md'])).toBe(true)
    expect(docsOnly(['docs/product/release-notes.mdx'])).toBe(true)
    expect(docsOnly(['docs/development/tests.md', 'docs/product/release-notes.mdx'])).toBe(true)

    for (const path of fixtureDocumentationPaths) {
      expect(docsOnly([path])).toBe(false)
    }

    expect(docsOnly(['docs/development/ci.md', 'docs/development/tests.md'])).toBe(false)
    expect(docsOnly(['.github/workflows/cleanup-artifacts.yml'])).toBe(false)
    expect(docsOnly(['docs/development/tests.md', 'package.json'])).toBe(false)
    // Now covered by the whole-tree docs/prompts/.+\.mdx? pattern -- see FIXTURE_DOC_TREES.
    expect(docsOnly(['docs/prompts/README.md'])).toBe(false)
  })

  it.each(['README.md', 'views.md', 'tables/widgets.md', 'nested/schema.md'])(
    'keeps generated Markdown fixture %s out of docs-only skipping and selects the tooling area',
    file => {
      const path = `docs/development/postgresql/schema-snapshot/markdown/${file}`
      expect(docsOnly([path])).toBe(false)
      expect(docsOnly([path, 'docs/development/tests.md'])).toBe(false)
      expect(toolingFilter().some(glob => picomatch.isMatch(path, glob))).toBe(true)
    },
  )

  it('keeps unrelated schema documentation eligible for docs-only skipping', () => {
    expect(docsOnly(['docs/development/postgresql/schema-snapshot/notes.md'])).toBe(true)
    expect(docsOnly(['docs/development/postgresql/schema-snapshot/markdown-other/README.md'])).toBe(
      true,
    )
  })

  it('does not put living pin-policy pages on TEST_FIXTURE_DOCS just to run the pin guard', () => {
    for (const { path } of LIVING_DOCS_PIN_CASES) {
      // .agents/skills/agent-workflow/implementation.md is skipped here because its whole tree is
      // a Vitest fixture tree (FIXTURE_DOC_TREES), not because it was added to TEST_FIXTURE_DOCS
      // to make the pin guard reachable -- that's the distinction this test guards.
      if (FIXTURE_DOC_TREES.some(tree => path.startsWith(`${tree}/`))) continue
      expect(docsOnly([path])).toBe(true)
    }
  })

  it('lists only fixture documents that exist', () => {
    for (const path of fixtureDocumentationPaths) {
      expect(existsSync(path)).toBe(true)
    }
  })

  it('covers every markdown file under the fixture-doc trees in the classifier and tooling filter', () => {
    for (const tree of FIXTURE_DOC_TREES) {
      const markdown = trackedFiles(repoRoot, [`${tree}/**`]).filter(path => /\.mdx?$/.test(path))

      expect(markdown.length).toBeGreaterThan(0) // an empty glob must not pass vacuously
      for (const path of markdown) expect(docsOnly([path])).toBe(false) // (a) -- the new coverage
      expect(toolingFilter()).toContain(`${tree}/**`)
    }
  })
})
