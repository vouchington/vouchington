import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from 'no-mistakes'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  rules?: Array<{
    exclude?: string[]
    name?: string
    rule?: string
    projects?: string[]
    options?: {
      allowedContexts?: unknown
      policies?: unknown[]
      packages?: Array<{ root: string; requiredFiles: string[] }>
      bannedPaths?: Array<{ glob: string; message?: string }>
    }
  }>
}

const config = (await resolveConfig({ root: repoRoot, view: 'declared' })) as NoMistakesConfig

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

function expectNoMistakesCurrentRange(version: string | undefined): void {
  expect(version).toMatch(/^\^\d+\.\d+\.\d+$/)
}

describe('no-mistakes config', () => {
  it('limits the Next route exception to the deployment-order Sentry bootstrap', () => {
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
    const revisionGuard = config.rules?.find(rule => rule.rule === 'no-test-git-sha')
    expect(revisionGuard).toBeDefined()
    expect(revisionGuard).not.toHaveProperty('options.allowedContexts')
    expect(config.rules).toContainEqual(expect.objectContaining({ rule: 'no-sparse-checkout' }))
  })

  it('requires nested Oxlint configs to preserve their ancestor overrides and plugins', () => {
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
    const packages = config.rules?.find(rule => rule.name === 'backend package required files')
      ?.options?.packages
    for (const [root, requiredFiles] of [
      ['backend/services', ['package.json', 'index.mts']],
      ['backend/agents', ['package.json', 'index.mts']],
      ['backend/data-stores', ['package.json', 'index.mts']],
      ['backend/modules', ['package.json', 'index.mts']],
      ['backend/entrypoints', ['package.json', 'serve.mts']],
    ]) {
      expect(packages).toContainEqual({ root, requiredFiles })
    }
  })

  it('runs the repository policy check in static CI', () => {
    const workflow = readRepoFile('.github/workflows/static-code-analysis.yml')
    expect(workflow).toContain('source ci/run-repository-static-checks.sh')
    const script = readRepoFile('ci/run-repository-static-checks.sh')
    expect(script).toContain('node static-code-analysis/run-node-checks.mts --checks')
    expect(script).toContain('repo-file-policy')
  })

  it('keeps extracted native sources and native-only helpers out of Vouchington', () => {
    const bannedPaths = config.rules?.find(rule => rule.name === 'banned repository paths')?.options
      ?.bannedPaths

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
      expect(bannedPaths).toContainEqual(expect.objectContaining({ glob: path }))
    }
    expect(bannedPaths).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('belongs in vouchington/vouchington-clients'),
      }),
    )
  })

  it('scopes playwright uniqueness and prefer-test-id rules to the web project (regression lock: enforcement via config, not CLI flags)', () => {
    for (const rule of [
      'playwright-unique-test-ids',
      'playwright-unique-html-ids',
      'playwright-prefer-test-id-locators',
    ]) {
      expect(config.rules?.find(candidate => candidate.rule === rule)?.projects).toContain('web')
    }
  })
})
