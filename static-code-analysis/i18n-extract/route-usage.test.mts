import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DependencyResult } from 'no-mistakes'
import { afterEach, describe, expect, it } from 'vitest'
import { dependencyPaths, dependencyResult, scanDependencyResult } from './route-usage.mts'

function result(files: DependencyResult['files']): DependencyResult {
  return { roots: [], files, diagnostics: [], tsconfig_provenance: [] }
}

describe('dependencyResult', () => {
  it('unwraps a dependencies report', () => {
    const report = { type: 'dependencies' as const, result: result([{ path: 'a.tsx', depth: 1 }]) }

    expect(dependencyResult(report, 'label')).toBe(report.result)
  })

  it('throws when the report is missing', () => {
    expect(() => dependencyResult(undefined, '/route')).toThrow(
      'Missing dependency report for /route',
    )
  })

  it('throws when the report type is not dependencies', () => {
    const report = { type: 'symbols' as const, result: result([]) }

    expect(() => dependencyResult(report, '/route')).toThrow('Missing dependency report for /route')
  })

  it('throws when the result has no files', () => {
    const report = { type: 'dependencies' as const, result: {} }

    expect(() => dependencyResult(report, '/route')).toThrow('Missing dependency report for /route')
  })
})

describe('dependencyPaths', () => {
  it('keeps only entries with a string path, in order', () => {
    const paths = dependencyPaths(
      result([
        { path: 'a.tsx', depth: 1 },
        { job: 'build', depth: 2 },
        { path: 'b.ts', depth: 1 },
      ]),
    )

    expect(paths).toEqual(['a.tsx', 'b.ts'])
  })

  it('returns an empty array when no entry has a path', () => {
    expect(dependencyPaths(result([{ procedure: 'user.get', depth: 1 }]))).toEqual([])
  })
})

describe('scanDependencyResult aliases', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function withFiles(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'route-usage-'))
    dirs.push(root)
    for (const [file, content] of Object.entries(files)) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), content)
    }
    return root
  }

  it('finds alias literals in root files and dependency-result files, deduplicated', async () => {
    const root = await withFiles({
      'page.tsx': "t('extracted.page.title')",
      'lib.ts': "export const label = 'shared.label.format'\nconst other = 'extracted.page.title'",
    })

    const aliases = (
      await scanDependencyResult(root, ['page.tsx'], result([{ path: 'lib.ts', depth: 1 }]))
    ).aliases

    expect(aliases).toEqual(new Set(['extracted.page.title', 'shared.label.format']))
  })

  it('skips non-source files even when present in the closure', async () => {
    const root = await withFiles({
      'page.tsx': "t('extracted.page.title')",
      'data.json': '{"nav.home": "extracted.should.not.match"}',
    })

    const aliases = (
      await scanDependencyResult(root, ['page.tsx'], result([{ path: 'data.json', depth: 1 }]))
    ).aliases

    expect(aliases).toEqual(new Set(['extracted.page.title']))
  })

  it('ignores dependency-result entries with no path', async () => {
    const root = await withFiles({ 'page.tsx': "t('extracted.page.title')" })

    const aliases = (
      await scanDependencyResult(root, ['page.tsx'], result([{ symbol: 'Page', depth: 1 }]))
    ).aliases

    expect(aliases).toEqual(new Set(['extracted.page.title']))
  })

  it('reuses a cached read instead of re-reading a file already on disk', async () => {
    const root = await withFiles({ 'page.tsx': "t('extracted.on.disk')" })
    const textCache = new Map([['page.tsx', Promise.resolve("t('extracted.from.cache')")]])

    const aliases = (await scanDependencyResult(root, ['page.tsx'], result([]), textCache)).aliases

    expect(aliases).toEqual(new Set(['extracted.from.cache']))
  })

  it('ignores unquoted alias-shaped tokens', async () => {
    const root = await withFiles({
      'page.tsx': "// extracted.page.title\nexport const label = t('nav.home')",
    })

    const aliases = (await scanDependencyResult(root, ['page.tsx'], result([]))).aliases

    expect(aliases).toEqual(new Set(['nav.home']))
  })
})

describe('scanDependencyResult', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function withFiles(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'route-scan-'))
    dirs.push(root)
    for (const [file, content] of Object.entries(files)) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), content)
    }
    return root
  }

  it('reports unbounded translation keys in reachable source', async () => {
    const root = await withFiles({
      'web/app/page.tsx': 'export default function Page() { return t(`extracted.foo.${id}`) }',
    })

    const scan = await scanDependencyResult(root, ['web/app/page.tsx'], result([]))

    expect(scan.issues).toEqual([{ file: 'web/app/page.tsx', reason: 'unbounded translation key' }])
  })

  it('skips a reviewed computed-import exclusion', async () => {
    const root = await withFiles({
      'web/lib/dynamic.ts': 'void import(`./${name}`)\n',
    })

    const scan = await scanDependencyResult(root, ['web/lib/dynamic.ts'], result([]), new Map(), [
      { file: 'web/lib/dynamic.ts', specifier: 'computed', reason: 'reviewed fixture' },
    ])

    expect(scan.issues).toEqual([])
  })
})
