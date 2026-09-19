import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

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
// PR touching only one of them skips select-ci/test-tooling entirely (ci.yml:203).
const FIXTURE_DOC_TREES = ['.agents/skills', 'docs/prompts'] as const

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

function mainChecksPushPaths(): string[] {
  return parseYaml(readRepoFile('.github/workflows/main-checks.yml')).on.push.paths
}

function mainChecksToolingFilter(): string[] {
  const workflow = parseYaml(readRepoFile('.github/workflows/main-checks.yml')) as {
    jobs: { 'select-main-checks': { steps: Array<{ with?: { filters?: string } }> } }
  }
  const filterStep = workflow.jobs['select-main-checks'].steps.find(step => step.with?.filters)
  const filters = parseYaml(filterStep?.with?.filters ?? '') as { tooling: string[] }
  return filters.tooling
}

function toolingFilter(): string[] {
  return parseYaml(readRepoFile('.github/ci-path-filters.yml')).tooling
}

function fullSuiteTriggerPaths(): string[] {
  const config = parseYaml(readRepoFile('.no-mistakes.yml')) as {
    test_plan: { vitest: { fullSuiteTriggers: { triggers: Array<{ paths?: string[] }> } } }
  }
  return config.test_plan.vitest.fullSuiteTriggers.triggers.flatMap(trigger => trigger.paths ?? [])
}

const fixtureDocumentationPaths = [
  '.github/workflows/README.md',
  '.github/workflows/VITEST.md',
  '.github/workflows/CLAUDE.md',
  '.github/workflows/WORKFLOWS.md',
  '.github/workflows/AUTHORING.md',
  '.github/workflows/reference-step-timeouts.md',
  '.github/workflows/reference-artifact-rerun-safety.md',
  '.github/workflows/reference-github-actions-concurrency-locks.md',
  '.github/workflows/reference-harness-automation-accepted-risk.md',
  '.github/workflows/reference-fixed-branch-automation-prs.md',
  '.github/workflows/reference-fix-main-dependency-policy.md',
  '.github/workflows/reference-workflow-automation-map.md',
  '.github/workflows/reference-core-ci.md',
  '.github/workflows/reference-vitest.md',
  '.github/workflows/reference-playwright-and-storybook.md',
  '.github/workflows/reference-deploy-and-release.md',
  '.github/workflows/reference-harness-automation.md',
  '.github/workflows/reference-workflow-change-preflight.md',
  '.github/workflows/reference-maintenance-security-and-utilities.md',
  'CLAUDE.md',
  'docs/development/ci.md',
  'docs/development/reference-ci-classifying-transient-infrastructure-failures.md',
  'docs/development/reference-ci-ci-job-conditions.md',
  'docs/development/reference-ci-ci-job-timeout-budgets.md',
  'docs/development/reference-ci-test-workflows.md',
  'docs/development/reference-ci-standalone-workflow-checks.md',
  'docs/checklists/github-actions.md',
  'docs/development/reference-dependency-updates-frozen-install-policy.md',
  'docs/development/dependency-updates.md',
  'docs/development/first-party-dependencies.md',
  'docs/development/reference-dependency-updates-first-party-release-gate-exemptions.md',
  'docs/development/reference-dependency-updates-supply-chain-policy.md',
  'dev/reference-bedrock-embeddings-local.md',
  'dev/README.md',
  'dev/reference-command-catalog.md',
  'backend/README.md',
  'backend/agents/CLAUDE.md',
  'backend/agents/README.md',
  'backend/agents/reference-tests.md',
  'backend/data-stores/psql/reference-migrations-views-and-config-driven.md',
  'backend/data-stores/psql/schema-snapshot/README.md',
  'docs/overview/architecture/agent-tools/catalog.md',
  'docs/overview/architecture/agent-tools/README.md',
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
    expect(docsOnly(['docs/development/tests.md', '.github/workflows/VITEST.md'])).toBe(false)
    expect(docsOnly(['.github/workflows/cleanup-artifacts.yml'])).toBe(false)
    expect(docsOnly(['docs/development/tests.md', 'package.json'])).toBe(false)
    // Now covered by the whole-tree docs/prompts/.+\.mdx? pattern -- see FIXTURE_DOC_TREES.
    expect(docsOnly(['docs/prompts/README.md'])).toBe(false)
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

  it('lists only fixture documents that exist and keeps the ci.md cross-link intact', () => {
    for (const path of fixtureDocumentationPaths) {
      expect(existsSync(path)).toBe(true)
    }

    expect(readFileSync('docs/development/ci.md', 'utf8')).toContain(
      '[Dependabot auto-merge and main push CI](reference-ci-standalone-workflow-checks.md#dependabot-auto-merge-and-main-push-ci)',
    )
  })

  it('covers every markdown file under the fixture-doc trees across all five inventories', () => {
    for (const tree of FIXTURE_DOC_TREES) {
      const markdown = execFileSync('git', ['ls-files', '-z', '--', `${tree}/**`], {
        encoding: 'utf8',
      })
        .split('\0')
        .filter(path => /\.mdx?$/.test(path))

      expect(markdown.length).toBeGreaterThan(0) // an empty glob must not pass vacuously
      for (const path of markdown) expect(docsOnly([path])).toBe(false) // (a) -- the new coverage
      expect(toolingFilter()).toContain(`${tree}/**`) // (c) -- restates main-checks.test.mts:49-50
      expect(mainChecksPushPaths()).toContain(`${tree}/**`) // (d) -- restates main-checks.test.mts:33-34
      expect(mainChecksToolingFilter()).toContain(`${tree}/**`) // (d)
      expect(fullSuiteTriggerPaths()).toContain(`${tree}/**`) // (e) -- restates no-mistakes-test-plan-config.test.mts:216-226
    }
  })
})
