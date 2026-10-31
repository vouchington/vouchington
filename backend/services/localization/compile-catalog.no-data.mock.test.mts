import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import type { LocalizationCatalog } from '@vouchington/localization'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type LoadCatalogDirectory = typeof import('@vouchington/localization-compiler').loadCatalogDirectory
type CompileLocalizationSqlite =
  typeof import('@vouchington/localization-compiler').compileLocalizationSqlite

const localizationCompiler = vi.hoisted(() => ({
  loadCatalogDirectory: vi.fn<LoadCatalogDirectory>(),
  compileLocalizationSqlite: vi.fn<CompileLocalizationSqlite>(),
}))

vi.mock<typeof import('@vouchington/localization-compiler')>(
  import('@vouchington/localization-compiler'),
  () => ({
    loadCatalogDirectory: localizationCompiler.loadCatalogDirectory,
    compileLocalizationSqlite: localizationCompiler.compileLocalizationSqlite,
  }),
)

import { runCompileCli } from './compile-catalog.mts'

const TEST_CATALOG = { copies: [], aliases: [], translations: {} } satisfies LocalizationCatalog
const TEST_CATALOG_LOAD = { catalog: TEST_CATALOG, messages: [], tags: {} }
const TEST_COMPILER_REVISION = 'owned-compiler-revision'

const ORIGINAL_TMPDIR = process.env.TMPDIR

describe('runCompileCli', () => {
  beforeEach(() => {
    localizationCompiler.loadCatalogDirectory.mockReset()
    localizationCompiler.loadCatalogDirectory.mockResolvedValue(TEST_CATALOG_LOAD)
    localizationCompiler.compileLocalizationSqlite.mockReset()
    localizationCompiler.compileLocalizationSqlite.mockImplementation((_catalog, outputPath) => {
      writeFileSync(outputPath, 'owned compiler output')
      return TEST_COMPILER_REVISION
    })
  })

  afterEach(() => {
    if (ORIGINAL_TMPDIR === undefined) {
      delete process.env.TMPDIR
    } else {
      process.env.TMPDIR = ORIGINAL_TMPDIR
    }
  })
  it('resolves source and output paths and parses CLI flags at the compiler boundary', async () => {
    const source = relative(process.cwd(), mkdtempSync(join(tmpdir(), 'catalog-src-')))
    const output = relative(
      process.cwd(),
      join(mkdtempSync(join(tmpdir(), 'compiled-')), 'nested', 'catalog.sqlite'),
    )
    const observedTmpdirs: (string | undefined)[] = []
    localizationCompiler.compileLocalizationSqlite.mockImplementation((catalog, outputPath) => {
      observedTmpdirs.push(process.env.TMPDIR)
      expect(catalog).toBe(TEST_CATALOG)
      expect(outputPath).toBe(resolve(output))
      writeFileSync(outputPath, 'owned compiler output')
      return TEST_COMPILER_REVISION
    })

    await expect(runCompileCli(['--source', source, '--output', output])).resolves.toBe(
      TEST_COMPILER_REVISION,
    )
    expect(existsSync(dirname(resolve(output)))).toBe(true)
    expect(localizationCompiler.loadCatalogDirectory).toHaveBeenCalledTimes(1)
    expect(localizationCompiler.loadCatalogDirectory).toHaveBeenNthCalledWith(1, resolve(source))
    expect(localizationCompiler.compileLocalizationSqlite).toHaveBeenCalledTimes(1)
    expect(localizationCompiler.compileLocalizationSqlite).toHaveBeenNthCalledWith(
      1,
      TEST_CATALOG,
      resolve(output),
    )
    expect(observedTmpdirs).toEqual([dirname(resolve(output))])
    await expect(runCompileCli(['--source'])).rejects.toThrow(/Missing value/)
    await expect(runCompileCli(['--output', ''])).rejects.toThrow(/Missing value/)
    expect(process.env.TMPDIR).toBe(ORIGINAL_TMPDIR)
  })

  it('restores TMPDIR when the external compiler fails', async () => {
    const source = mkdtempSync(join(tmpdir(), 'catalog-src-'))
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'nested', 'catalog.sqlite')
    const originalTmpdir = join(tmpdir(), 'caller-owned-tmp')
    const failure = new Error('compiler rejected the output')
    vi.stubEnv('TMPDIR', originalTmpdir)
    localizationCompiler.compileLocalizationSqlite.mockImplementation((_catalog, outputPath) => {
      expect(outputPath).toBe(resolve(output))
      expect(process.env.TMPDIR).toBe(dirname(resolve(output)))
      throw failure
    })

    await expect(runCompileCli(['--source', source, '--output', output])).rejects.toBe(failure)
    expect(process.env.TMPDIR).toBe(originalTmpdir)
  })

  it('restores an unset TMPDIR after compiling instead of the output directory', async () => {
    delete process.env.TMPDIR
    const source = mkdtempSync(join(tmpdir(), 'catalog-src-'))
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'catalog.sqlite')
    await runCompileCli(['--source', source, '--output', output])
    expect(process.env.TMPDIR).toBeUndefined()
  })

  it('restores a previously set TMPDIR after compiling', async () => {
    const previous = mkdtempSync(join(tmpdir(), 'prior-tmp-'))
    process.env.TMPDIR = previous
    const source = mkdtempSync(join(tmpdir(), 'catalog-src-'))
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'catalog.sqlite')
    await runCompileCli(['--source', source, '--output', output])
    expect(process.env.TMPDIR).toBe(previous)
  })
})
