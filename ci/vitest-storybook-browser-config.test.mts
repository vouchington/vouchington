import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { importUsages } from 'no-mistakes'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { storybookBrowserOptimizeDeps } from '../test-helpers/vitest-config/storybook-browser-optimize-deps.mts'
import { permanentReleaseAgePackageNames } from './no-mistakes-config.mts'

const originalEnv = { ...process.env }
const requiredStorybookBrowserNestedParents = ['@ts-shared/feature-flags'] as const
// Cache-busting queries re-evaluate the module for current process.env without tsc resolving the URL.
const environmentModulePath = '../test-helpers/vitest-config/environment.mts'
const importEnvironmentModule = (
  cacheBustingQuery: string,
): Promise<typeof import('../test-helpers/vitest-config/environment.mts')> =>
  import(`${environmentModulePath}?${cacheBustingQuery}`)

describe('Storybook browser Vitest environment overrides', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    process.env = { ...originalEnv }
  })

  it('uses explicit browser cache, API port, and connection timeout env overrides', async () => {
    process.env = {
      ...originalEnv,
      CI: 'true',
      STORYBOOK_BROWSER_HANG_MS: '150000',
      VITEST_STORYBOOK_BROWSER_API_PORT: '49231',
      VITEST_STORYBOOK_BROWSER_CACHE_DIR: '/tmp/storybook-browser-cache',
    }

    const envConfig = await importEnvironmentModule('storybook-browser-overrides')

    expect(envConfig.storybookBrowserCacheDir).toBe('/tmp/storybook-browser-cache')
    expect(envConfig.parseStorybookBrowserApiPort()).toBe(49_231)
    expect(envConfig.parseStorybookBrowserConnectTimeout()).toBe(150_000)
  })

  it.each(['1', '27519989871'])(
    'uses a fixed CI cache and no implicit API port for run %s',
    async run => {
      process.env = {
        ...originalEnv,
        CI: 'true',
        GITHUB_JOB: `job-${run}`,
        GITHUB_RUN_ATTEMPT: run,
        GITHUB_RUN_ID: run,
        RUNNER_TEMP: '/runner-temp',
      }
      delete process.env.VITEST_STORYBOOK_BROWSER_API_PORT
      delete process.env.VITEST_STORYBOOK_BROWSER_CACHE_DIR
      delete process.env.STORYBOOK_BROWSER_HANG_MS

      const envConfig = await importEnvironmentModule(`storybook-browser-fixed-${run}`)

      expect(envConfig.storybookBrowserCacheDir).toBe('/runner-temp/vite-storybook-browser')
      expect(envConfig.parseStorybookBrowserApiPort()).toBeUndefined()
      expect(envConfig.parseStorybookBrowserConnectTimeout()).toBe(120_000)
    },
  )

  it('falls back to OS temp when CI RUNNER_TEMP is blank', async () => {
    process.env = {
      ...originalEnv,
      CI: 'true',
      GITHUB_JOB: 'storybook',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_RUN_ID: '27519989871',
      RUNNER_TEMP: '',
    }
    delete process.env.VITEST_STORYBOOK_BROWSER_API_PORT
    delete process.env.VITEST_STORYBOOK_BROWSER_CACHE_DIR

    const envConfig = await importEnvironmentModule('storybook-browser-blank-runner-temp')

    expect(envConfig.storybookBrowserCacheDir).toBe(`${tmpdir()}/vite-storybook-browser`)
  })

  it.each(['invalid', '0', '1.5'])('leaves an invalid explicit API port %s unset', async port => {
    vi.stubEnv('CI', 'true')
    vi.stubEnv('GITHUB_RUN_ID', '123')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER_API_PORT', port)
    const envConfig = await importEnvironmentModule(
      `storybook-browser-invalid-${port.replace('.', '-')}`,
    )
    expect(envConfig.parseStorybookBrowserApiPort()).toBeUndefined()
  })

  it('strips JSON import attributes for browser-story dependencies', async () => {
    const storybookBrowserProjectModulePath =
      '../test-helpers/vitest-config/storybook-browser-project.mts'
    const {
      stripJsonImportAttributes,
    }: typeof import('../test-helpers/vitest-config/storybook-browser-project.mts') = await import(
      `${storybookBrowserProjectModulePath}?json-attributes`
    )

    expect(
      stripJsonImportAttributes(
        [
          "import one from './one.json' with { type: 'json' }",
          'import two from "./two.json" assert { type: "json" }',
        ].join('\n'),
      ),
    ).toBe(["import one from './one.json'", 'import two from "./two.json"'].join('\n'))
  })
  it('pre-optimizes runtime imports of nested-include parents at their exact specifier', async () => {
    const firstPartyNames = permanentReleaseAgePackageNames()
    const include = new Set<string>(storybookBrowserOptimizeDeps)
    const nestedParents = new Set<string>(requiredStorybookBrowserNestedParents)

    for (const entry of storybookBrowserOptimizeDeps) {
      const nested = entry.split(' > ')
      if (nested.length !== 2) continue
      const [parent, child] = nested
      expect(workspacePackageDependencies(parent)).toContain(packageRoot(child))
      nestedParents.add(parent)
    }
    for (const parent of nestedParents) {
      const dependencies = workspacePackageDependencies(parent)
      const imports = await runtimeImportSpecifiers(
        productionSourceFiles(workspacePackageJsonPath(parent)),
      )
      const missing = imports.filter(specifier => {
        const dependency = packageRoot(specifier)
        expect(dependencies).toContain(dependency)
        return (
          isPublishedOrFirstPartyDependency(dependency, firstPartyNames) &&
          !hasOptimizedSpecifier(include, parent, specifier)
        )
      })
      expect(missing).toEqual([])
    }

    expect(
      hasOptimizedSpecifier(
        new Set(['@ts-shared/money > @vouchington/utils']),
        '@ts-shared/money',
        '@vouchington/utils/money',
      ),
    ).toBe(false)
  })

  it('collects only literal runtime module specifiers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-imports-'))
    try {
      writeFileSync(
        join(root, 'runtime.mts'),
        [
          "import type { TypeOnly } from 'type-only'",
          "import { type AlsoTypeOnly } from 'also-type-only'",
          "import { runtime } from '@vouchington/utils/money'",
          "export type { TypeOnly } from 're-exported-type-only'",
          "export { type AlsoTypeOnly } from 'also-re-exported-type-only'",
          "export { runtime } from 'published-runtime/deep'",
          "const dynamic = import('literal-dynamic/deep')",
          "import { exec } from 'node:child_process'",
          'const computed = import(packageName)',
          "type Deferred = import('import-type-only').Deferred",
          "const required = require('require-only')",
          "import local from './local.mts'",
        ].join('\n'),
      )
      expect(await runtimeImportSpecifiers([], root)).toEqual([])
      expect(await runtimeImportSpecifiers(['runtime.mts'], root)).toEqual([
        '@vouchington/utils/money',
        'published-runtime/deep',
        'literal-dynamic/deep',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

function workspacePackageJsonPath(packageName: string): string {
  if (!packageName.startsWith('@') || !packageName.includes('/')) {
    throw new Error(`nested-include parent must be a scoped package: ${packageName}`)
  }
  return `${packageName.slice(1)}/package.json`
}
function workspacePackageDependencies(packageName: string): string[] {
  const manifest = JSON.parse(readFileSync(workspacePackageJsonPath(packageName), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return Object.keys(manifest.dependencies ?? {})
}
async function runtimeImportSpecifiers(
  files: readonly string[],
  root = process.cwd(),
): Promise<string[]> {
  if (files.length === 0) return []
  const result = await importUsages({
    root,
    files: [...files],
    timeout: 30,
    lockTimeout: 10,
    jobs: 1,
  })
  const imports = result.files.flatMap(file =>
    file.imports
      .filter(item => item.kind === 'static' || item.kind === 'dynamic')
      .map(item => item.specifier),
  )
  return [...new Set(imports)].filter(
    specifier => !['.', '/', 'node:'].some(prefix => specifier.startsWith(prefix)),
  )
}

function productionSourceFiles(packageJsonPath: string): string[] {
  const directory = packageJsonPath.slice(0, -'/package.json'.length)
  const files: string[] = []
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const entryPath = join(path, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(entryPath)
      } else if (isProductionSourceFile(entryPath)) {
        files.push(entryPath)
      }
    }
  }
  visit(directory)
  return files
}

function isProductionSourceFile(filePath: string): boolean {
  const extension = extname(filePath)
  return (
    ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].includes(extension) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(basename(filePath))
  )
}

function packageRoot(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/')
    if (name) return `${scope}/${name}`
  }
  return specifier.split('/')[0]
}

function isPublishedOrFirstPartyDependency(
  dependency: string,
  firstPartyNames: Set<string>,
): boolean {
  return dependency.startsWith('@vouchington/') || firstPartyNames.has(dependency)
}
function hasOptimizedSpecifier(include: Set<string>, parent: string, specifier: string): boolean {
  return include.has(specifier) || include.has(`${parent} > ${specifier}`)
}
