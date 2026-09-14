import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  rules?: Array<{ exclude?: string[]; name?: string; options?: { policies?: unknown[] } }>
}

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

const workflowDocPaths = [
  '.agents/skills/agent-workflow/SKILL.md',
  '.agents/skills/agent-workflow/start-of-work.md',
  '.agents/skills/agent-workflow/implementation.md',
  '.agents/skills/agent-workflow/code-review.md',
  '.agents/skills/agent-workflow/before-pushing.md',
  '.agents/skills/agent-workflow/git-and-prs.md',
  '.agents/skills/planning/SKILL.md',
  '.agents/skills/planning/references/impact-discovery.md',
  'docs/development/tests.md',
] as const

function expectNoMistakesCurrentRange(version: string | undefined): void {
  expect(version).toMatch(/^\^\d+\.\d+\.\d+$/)
}

describe('no-mistakes config', () => {
  it('limits the Next route exception to the deployment-order Sentry bootstrap', () => {
    const config = parseYaml(readRepoFile('.no-mistakes.yml')) as NoMistakesConfig
    const policy = config.rules?.find(rule => rule.name === 'web no Next.js API routes')
    expect(policy?.exclude).toEqual(['web/app/runtime-sentry-config.js/route.ts'])
  })

  it('pins no-mistakes to the current version range and configures expected scripts', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }

    expectNoMistakesCurrentRange(pkg.devDependencies['no-mistakes'])
    expectNoMistakesCurrentRange(pkg.devDependencies['eslint-plugin-no-mistakes'])
    expect(pkg.scripts['no-mistakes']).toBe(
      'no-mistakes --timeout 60 --lock-timeout 55 check --tsconfig tsconfig.json',
    )

    const ciPkg = JSON.parse(readRepoFile('ci/package.json')) as {
      dependencies: Record<string, string>
    }
    expectNoMistakesCurrentRange(ciPkg.dependencies['no-mistakes'])
  })

  it('documents current no-mistakes agent impact recipes', () => {
    const workflowStartOfWork = readRepoFile(
      '.agents/skills/planning/references/impact-discovery.md',
    )

    expect(workflowStartOfWork).toMatch(
      /https:\/\/github\.com\/jonathanong\/filaments\/blob\/[0-9a-f]{40}\/\.agents\/skills\/no-mistakes\/references\/impact-recipes\.md/u,
    )
    expect(workflowStartOfWork).toContain('pnpm exec no-mistakes planning-impact')
    const legacyVitestPlanner = ['pnpm exec vitest', 'related'].join(' ')
    for (const path of workflowDocPaths) {
      expect(readRepoFile(path)).not.toContain(legacyVitestPlanner)
    }
  })

  it('configures the package-owned Git revision and sparse-checkout guards', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')

    expect(noMistakes).toContain('rule: no-test-git-sha')
    expect(noMistakes).toContain('rule: no-sparse-checkout')
    expect(noMistakes).toContain('ci/no-mistakes-workflows/**')
    expect(noMistakes).not.toContain('allowedContexts:')
  })

  it('requires nested Oxlint configs to preserve their ancestor overrides and plugins', () => {
    const config = parseYaml(readRepoFile('.no-mistakes.yml')) as NoMistakesConfig
    const policy = config.rules?.find(
      rule => rule.name === 'root oxlintrc override globs and bind ban',
    )?.options?.policies

    expect(policy).toContainEqual(
      expect.objectContaining({
        files: ['**/.oxlintrc.json'],
        valueAssertions: expect.arrayContaining([
          { kind: 'ancestor-override-subset' },
          {
            file: '.oxlintrc.json',
            fromKey: 'plugins',
            key: 'plugins',
            kind: 'equals-file',
          },
        ]),
        when: [{ key: 'extends' }],
      }),
    )
  })

  it('loads the no-mistakes oxlint plugin with expected rule configuration', () => {
    const oxlint = parseJsonc(readRepoFile('.oxlintrc.json')) as {
      jsPlugins: Array<string | { name?: string; specifier?: string }>
      plugins: Array<string | { name?: string; specifier?: string }>
      overrides: unknown[]
      rules: Record<string, unknown>
    }
    const reactOxlint = parseJsonc(readRepoFile('.oxlintrc.react.json')) as {
      rules: Record<string, unknown>
    }

    expect(oxlint.jsPlugins).toContainEqual(
      expect.objectContaining({ specifier: 'eslint-plugin-no-mistakes' }),
    )
    expect(oxlint.jsPlugins).toContainEqual(
      expect.objectContaining({
        name: 'voucha',
        specifier: './static-code-analysis/oxlint-plugin.cjs',
      }),
    )
    expect(oxlint.rules['voucha/no-prefix-wide-rate-limiter-invalidate']).toBe('error')
    expect(oxlint.rules['no-mistakes/playwright-literals']).toBe('error')
    expect(oxlint.rules).not.toHaveProperty('no-mistakes/playwright-no-set-timeout')
    expect(readRepoFile('playwright/.oxlintrc.json')).not.toContain(
      'no-mistakes/playwright-no-set-timeout',
    )
    expect(oxlint.rules['no-mistakes/no-import-only-test-files']).toBe('error')
    expect(oxlint.rules['no-mistakes/test-no-delayed-rejects']).toBe('error')
    expect(reactOxlint.rules['no-mistakes/nextjs-no-manual-script-tags']).toEqual([
      'error',
      expect.objectContaining({ allowInlineScriptIds: expect.any(Array) }),
    ])
    expect(reactOxlint.rules['no-mistakes/nextjs-static-fetch-method']).toBe('off')
    expect(reactOxlint.rules['no-mistakes/nextjs-static-fetch-url']).toBe('off')
    expect(reactOxlint.rules['no-mistakes/react-no-nullish-react-node']).toBe('error')
    expect(oxlint.rules).not.toHaveProperty('@local/voucha/export-alias')
    expect(oxlint.rules).not.toHaveProperty('@local/voucha/no-error-message-matching')
    expect(oxlint.rules).not.toHaveProperty('@local/voucha/web-no-manual-script-tags')
    expect(oxlint.rules).not.toHaveProperty('@local/voucha/web-no-inline-api-response-mock')
    expect(oxlint.rules).not.toHaveProperty('@local/voucha/web-no-inline-entity-href')
    expect(reactOxlint.rules).not.toHaveProperty('@local/voucha/web-icon-button-tooltip')
    expect(oxlint.rules['no-mistakes/test-no-error-message-matching']).toBe('error')
    expect(oxlint.jsPlugins).not.toContainEqual(
      expect.objectContaining({ specifier: './static-code-analysis/oxlint-plugin/src/index.mts' }),
    )
    expect(oxlint.rules['no-mistakes/test-no-shared-state']).toBe('error')
    expect(oxlint.rules['no-mistakes/module-mock-boundary']).toEqual([
      'error',
      expect.objectContaining({
        baseline: expect.any(Array),
        integrationExports: expect.objectContaining({ specifiers: ['@modules/**'] }),
      }),
    ])
    expect(oxlint.rules['no-mistakes/module-mock-preserve-exports']).toEqual([
      'error',
      expect.objectContaining({ baseline: expect.any(Array) }),
    ])
    expect(oxlint.rules['no-mistakes/async-call-disposition']).toBe('off')
    expect(oxlint.rules['no-mistakes/no-inline-noop-promise-catch']).toEqual([
      'error',
      {
        allowedPathPatterns: [
          '**/*.test.*',
          '**/*.spec.*',
          '**/__tests__/**',
          '**/test-helpers/**',
        ],
        checkedPathPatterns: ['backend/**', 'web/**'],
      },
    ])
    expect(JSON.stringify(oxlint.overrides)).toContain(
      '"no-mistakes/async-call-disposition":["error"',
    )
    expect(oxlint.rules['no-mistakes/async-try-catch-return-await']).toEqual([
      'error',
      expect.objectContaining({ handlers: expect.any(Array) }),
    ])
    expect(oxlint.rules['no-mistakes/no-global-fetch-outside-helper']).toEqual([
      'error',
      expect.objectContaining({ checkedPathPatterns: ['web/**'] }),
    ])
    // Migrated: ts-no-export-renaming replaces @local/voucha/export-alias (backend-scoped)
    expect(oxlint.rules['no-mistakes/ts-no-export-renaming']).toEqual([
      'error',
      expect.objectContaining({ includePathPatterns: expect.any(Array) }),
    ])
    expect(oxlint.rules['no-mistakes/ts-no-function-aliases']).toBe('error')
    expect(oxlint.rules['no-mistakes/ts-preserve-null-option-defaults']).toEqual([
      'error',
      expect.objectContaining({ optionObjectNames: expect.any(Array) }),
    ])
    expect(oxlint.rules['no-mistakes/server-require-nullable-fetch-wrapper']).toEqual([
      'error',
      expect.objectContaining({ requiredWrapperCallee: 'returnNullForMissingEntity' }),
    ])
    expect(oxlint.rules['@local/voucha/mock-test-file-naming']).toBeUndefined()
    expect(oxlint.rules['no-mistakes/vitest-mock-test-file-naming']).toBe('error')
    const webOxlintText = JSON.stringify(parseJsonc(readRepoFile('web/.oxlintrc.json')))
    expect(webOxlintText).toContain('"no-mistakes/nextjs-static-fetch-method":"error"')
    expect(webOxlintText).toContain('"no-mistakes/nextjs-static-fetch-url":"error"')
  })

  it('requires package.json + barrel/entry files across backend package families', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')

    // Each regex binds the root to its expected requiredFiles value so a swap
    // (e.g. giving backend/entrypoints index.mts instead of serve.mts) is caught.
    const requiredPatterns = [
      /- root: backend\/services\s+requiredFiles: \[package\.json, index\.mts\]/,
      /- root: backend\/agents\s+requiredFiles: \[package\.json, index\.mts\]/,
      /- root: backend\/data-stores\s+requiredFiles: \[package\.json, index\.mts\]/,
      /- root: backend\/modules\s+requiredFiles: \[package\.json, index\.mts\]/,
      /- root: backend\/entrypoints\s+requiredFiles: \[package\.json, serve\.mts\]/,
    ]
    for (const pattern of requiredPatterns) {
      expect(noMistakes).toMatch(pattern)
    }
  })

  it('configures parity filesystem rules in no-mistakes check and workflow', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')
    const workflow = readRepoFile('.github/workflows/static-code-analysis.yml')

    for (const rule of [
      'banned-renamed-files',
      'file-extension-policy',
      'lockfile-allowlist',
      'package-json-registry-only',
      'package-json-workspace-coverage',
      'no-empty-or-comments-only-files',
      'required-local-docs',
      'required-doc-section',
      'no-git-identity-mutation',
      'shellcheck-runner',
      'strict-package-layout',
      'github-actions-pinned-hash',
      'require-test-per-subdir',
      'require-files-in-subdirs',
      'markdown-eval-tests',
      'postgres-fk-index',
      'postgres-constraint-validate',
      'markdown-child-links',
      'github-actions-job-timeouts',
      'structured-config-policy',
      'config-path-references',
      'package-json-nested-workspace-coverage',
      'banned-paths',
    ]) {
      expect(noMistakes).toContain(`rule: ${rule}`)
    }

    expect(noMistakes).toMatch(/rule: github-actions-pinned-hash\n {4}scope: repository/)

    expect(workflow).toContain(
      'node static-code-analysis/run-node-checks.mts --checks config-inventory-policy,repo-file-policy,scc-complexity,targeted-guardrails',
    )

    expect(noMistakes).toContain('name: webpack.config')
  })

  it('keeps extracted native sources and native-only helpers out of Filaments', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')

    for (const path of [
      'swift-clients/**',
      'dotnet-clients/**',
      'ci/coverage-dotnet-lcov-merge.mts',
      'ci/coverage-dotnet-lcov-runs.mts',
      'ci/__fixtures__/stale-dotnet-app.mts',
      'ci/swift-source-offset.mts',
      'ci/swift-resolved-pin-delta.mts',
      'ci/swift-resolved-pin-delta.test.mts',
    ]) {
      expect(noMistakes).toContain(`glob: ${path}`)
    }
    expect(noMistakes).toContain('belongs in vouchington/vouchington-clients')
  })

  it('scopes playwright uniqueness and prefer-test-id rules to the web project (regression lock: enforcement via config, not CLI flags)', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')

    // Use a negative lookahead on `- name:` so the regex cannot bleed into the next rule.
    for (const rule of [
      'playwright-unique-test-ids',
      'playwright-unique-html-ids',
      'playwright-prefer-test-id-locators',
    ]) {
      expect(noMistakes).toMatch(
        new RegExp(
          `rule: ${rule}(?:(?!-\\s+name:)[\\s\\S])*?projects:(?:(?!-\\s+name:)[\\s\\S])*?- web(?![-\\w])`,
        ),
      )
    }
  })
})
