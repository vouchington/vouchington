import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { ImportUsagesResult } from 'no-mistakes'
import { afterEach, describe, expect, it } from 'vitest'

import {
  runtimeImportSpecifiers,
  storybookBrowserOptimizeDepsErrors,
  type ReadImportUsages,
} from './check-storybook-browser-optimize-deps.mts'

type ImportUsage = ImportUsagesResult['files'][number]['imports'][number]

const roots: string[] = []

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'storybook-optimize-deps-'))
  roots.push(root)
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), source)
  }
  return root
}

function manifest(...dependencies: string[]): string {
  return JSON.stringify({
    dependencies: Object.fromEntries(dependencies.map(name => [name, 'workspace:*'])),
  })
}

function usage(specifier: string, kind: ImportUsage['kind'] = 'static'): ImportUsage {
  return { specifier, packageName: null, kind, line: 1, sideEffectOnly: false, reExport: false }
}

function fakeImports(byPackage: Record<string, string[]>) {
  const calls: string[][] = []
  const read: ReadImportUsages = (_root, files) => {
    calls.push(files)
    const directory = Object.keys(byPackage).find(dir => files[0].startsWith(`${dir}/`))
    const imports = (directory === undefined ? [] : byPackage[directory]).map(s => usage(s))
    return Promise.resolve({ roots: [], files: [{ path: files[0], imports }] })
  }
  return { calls, read }
}

describe('Storybook browser optimizeDeps audit', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('maps only static and dynamic bare specifiers', () => {
    const result: ImportUsagesResult = {
      roots: [],
      files: [
        {
          path: 'runtime.mts',
          imports: [
            usage('@vouchington/utils/money'),
            usage('type-only', 'type'),
            usage('literal-dynamic/deep', 'dynamic'),
            usage('require-only', 'require'),
            usage('resolved-only', 'require-resolve'),
            usage('./local.mts'),
            usage('/absolute.mts'),
            usage('node:child_process'),
            usage('@vouchington/utils/money', 'dynamic'),
          ],
        },
      ],
    }
    expect(runtimeImportSpecifiers(result)).toEqual([
      '@vouchington/utils/money',
      'literal-dynamic/deep',
    ])
  })

  it('accepts exact and nested includes and reads only production sources', async () => {
    const root = workspace({
      'ts-shared/feature-flags/package.json': manifest('@vouchington/utils'),
      'ts-shared/feature-flags/src/index.ts': '',
      'ts-shared/feature-flags/src/flags.test.ts': '',
      'ts-shared/feature-flags/__tests__/flags.ts': '',
      'ts-shared/feature-flags/README.md': '',
    })
    const imports = fakeImports({
      'ts-shared/feature-flags': ['@vouchington/utils/feature-flags', 'jose', 'react'],
    })
    const errors = await storybookBrowserOptimizeDepsErrors({
      root,
      include: ['@ts-shared/feature-flags > @vouchington/utils/feature-flags', 'jose'],
      firstPartyNames: new Set(['jose']),
      readImports: imports.read,
    })
    expect(errors).toEqual([])
    expect(imports.calls).toEqual([['ts-shared/feature-flags/src/index.ts']])
  })

  it('reports undeclared nested children and runtime imports missing exact includes', async () => {
    const root = workspace({
      'ts-shared/feature-flags/package.json': manifest(),
      'ts-shared/feature-flags/index.ts': '',
      'ts-shared/money/package.json': manifest('@vouchington/utils'),
      'ts-shared/money/index.ts': '',
    })
    const errors = await storybookBrowserOptimizeDepsErrors({
      root,
      include: ['@ts-shared/money > @vouchington/utils', '@ts-shared/money > uuid'],
      firstPartyNames: new Set(),
      readImports: fakeImports({
        'ts-shared/feature-flags': ['@vouchington/utils/feature-flags'],
        'ts-shared/money': ['@vouchington/utils/money'],
      }).read,
    })
    expect(errors).toEqual([
      '@ts-shared/money > uuid: @ts-shared/money does not declare uuid',
      "@ts-shared/feature-flags: add '@ts-shared/feature-flags > @vouchington/utils/feature-flags' to storybookBrowserOptimizeDeps",
      "@ts-shared/money: add '@ts-shared/money > @vouchington/utils/money' to storybookBrowserOptimizeDeps",
    ])
  })

  it('skips parents without production sources and rejects unscoped parents', async () => {
    const root = workspace({ 'ts-shared/feature-flags/__tests__/flags.ts': '' })
    const imports = fakeImports({})
    await expect(
      storybookBrowserOptimizeDepsErrors({
        root,
        include: [],
        firstPartyNames: new Set(),
        readImports: imports.read,
      }),
    ).resolves.toEqual([])
    expect(imports.calls).toEqual([])

    await expect(
      storybookBrowserOptimizeDepsErrors({
        root,
        include: ['plain > child'],
        firstPartyNames: new Set(),
        readImports: imports.read,
      }),
    ).rejects.toThrow('nested-include parent must be a scoped package: plain')
  })
})
