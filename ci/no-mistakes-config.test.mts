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
    expect(pkg.scripts['no-mistakes']).toBe('no-mistakes --timeout 180 --lock-timeout 55 check')

    const ciPkg = JSON.parse(readRepoFile('ci/package.json')) as {
      dependencies: Record<string, string>
    }
    expectNoMistakesCurrentRange(ciPkg.dependencies['no-mistakes'])
  })

  it('configures the package-owned Git revision guard and the sparse-checkout guard', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')
    expect(noMistakes).toContain('rule: no-test-git-sha')
    expect(noMistakes).not.toContain('allowedContexts:')
    expect(noMistakes).toContain('rule: no-sparse-checkout')
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

  it('enables the no-mistakes Oxlint plugin in the intended projects', () => {
    const oxlint = parseJsonc(readRepoFile('.oxlintrc.json')) as {
      jsPlugins: Array<string | { specifier?: string }>
      rules: Record<string, unknown>
    }
    const reactOxlint = parseJsonc(readRepoFile('.oxlintrc.react.json')) as {
      rules: Record<string, unknown>
    }
    const webOxlint = parseJsonc(readRepoFile('web/.oxlintrc.json')) as {
      overrides: Array<{ files?: string[]; rules?: Record<string, unknown> }>
    }

    expect(oxlint.jsPlugins).toContainEqual(
      expect.objectContaining({ specifier: 'eslint-plugin-no-mistakes' }),
    )
    expect(oxlint.rules['no-mistakes/test-no-shared-state']).toBe('error')
    expect(reactOxlint.rules['no-mistakes/react-no-nullish-react-node']).toBe('error')
    expect(webOxlint.overrides).toContainEqual(
      expect.objectContaining({
        files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
        rules: expect.objectContaining({ 'no-mistakes/nextjs-static-fetch-method': 'error' }),
      }),
    )
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

  it('runs the repository policy check in static CI', () => {
    const workflow = readRepoFile('.github/workflows/static-code-analysis.yml')
    expect(workflow).toContain('node static-code-analysis/run-node-checks.mts --checks')
    expect(workflow).toContain('repo-file-policy')
  })

  it('keeps extracted native sources and native-only helpers out of Vouchington', () => {
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
