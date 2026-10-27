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

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    existsSync(path: Parameters<typeof actual.existsSync>[0]) {
      if (String(path) === '/dev/shm' && process.env.TEST_LOCALIZATION_SHM !== undefined) {
        return process.env.TEST_LOCALIZATION_SHM === '1'
      }
      return actual.existsSync(path)
    },
  }
})
import {
  catalogScratchDirectory,
  compileCatalogDirectory,
  compileCatalogForProcess,
  ensurePlaywrightLocalizationSqlite,
  runCompileCli,
} from './compile-catalog.mts'

const TEST_CATALOG = { copies: [], aliases: [], translations: {} } satisfies LocalizationCatalog
const TEST_CATALOG_LOAD = { catalog: TEST_CATALOG, messages: [], tags: {} }
const TEST_COMPILER_REVISION = 'owned-compiler-revision'

const ORIGINAL_LOCALIZATION_SQLITE_PATH = process.env.LOCALIZATION_SQLITE_PATH
const ORIGINAL_PLAYWRIGHT_TEST = process.env.PLAYWRIGHT_TEST
const ORIGINAL_TEST_LOCALIZATION_SHM = process.env.TEST_LOCALIZATION_SHM
const ORIGINAL_TMPDIR = process.env.TMPDIR

describe('compileCatalogDirectory', () => {
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
    if (ORIGINAL_LOCALIZATION_SQLITE_PATH === undefined) {
      delete process.env.LOCALIZATION_SQLITE_PATH
    } else {
      process.env.LOCALIZATION_SQLITE_PATH = ORIGINAL_LOCALIZATION_SQLITE_PATH
    }
    if (ORIGINAL_PLAYWRIGHT_TEST === undefined) {
      delete process.env.PLAYWRIGHT_TEST
    } else {
      process.env.PLAYWRIGHT_TEST = ORIGINAL_PLAYWRIGHT_TEST
    }
    if (ORIGINAL_TEST_LOCALIZATION_SHM === undefined) {
      delete process.env.TEST_LOCALIZATION_SHM
    } else {
      process.env.TEST_LOCALIZATION_SHM = ORIGINAL_TEST_LOCALIZATION_SHM
    }
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

    await expect(compileCatalogDirectory(source, output)).resolves.toBe(TEST_COMPILER_REVISION)
    expect(existsSync(dirname(resolve(output)))).toBe(true)
    expect(localizationCompiler.loadCatalogDirectory).toHaveBeenNthCalledWith(1, resolve(source))
    expect(localizationCompiler.compileLocalizationSqlite).toHaveBeenNthCalledWith(
      1,
      TEST_CATALOG,
      resolve(output),
    )
    expect(observedTmpdirs).toEqual([dirname(resolve(output))])
    await expect(runCompileCli(['--source', source, '--output', output])).resolves.toBe(
      TEST_COMPILER_REVISION,
    )
    await expect(runCompileCli(['--source'])).rejects.toThrow(/Missing value/)
    await expect(runCompileCli(['--output', ''])).rejects.toThrow(/Missing value/)
    expect(localizationCompiler.loadCatalogDirectory).toHaveBeenCalledTimes(2)
    expect(localizationCompiler.loadCatalogDirectory).toHaveBeenNthCalledWith(2, resolve(source))
    expect(localizationCompiler.compileLocalizationSqlite).toHaveBeenCalledTimes(2)
    expect(localizationCompiler.compileLocalizationSqlite).toHaveBeenNthCalledWith(
      2,
      TEST_CATALOG,
      resolve(output),
    )
    expect(observedTmpdirs).toEqual([dirname(resolve(output)), dirname(resolve(output))])
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

    await expect(compileCatalogDirectory(source, output)).rejects.toBe(failure)
    expect(process.env.TMPDIR).toBe(originalTmpdir)
  })

  it('points LOCALIZATION_SQLITE_PATH at the compiled file', async () => {
    const source = mkdtempSync(join(tmpdir(), 'catalog-src-'))
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'catalog.sqlite')
    await expect(compileCatalogForProcess({ source, output })).resolves.toBe(output)
    expect(process.env.LOCALIZATION_SQLITE_PATH).toBe(output)
    expect(existsSync(output)).toBe(true)
    const fallback = await compileCatalogForProcess({ source })
    expect(fallback).toMatch(/vouchington-catalog-\d+\.sqlite$/u)
    expect(process.env.LOCALIZATION_SQLITE_PATH).toBe(fallback)
    expect(existsSync(fallback)).toBe(true)
  })

  it('restores an unset TMPDIR after compiling instead of the output directory', async () => {
    delete process.env.TMPDIR
    const source = mkdtempSync(join(tmpdir(), 'catalog-src-'))
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'catalog.sqlite')
    await compileCatalogDirectory(source, output)
    expect(process.env.TMPDIR).toBeUndefined()
  })

  it('restores a previously set TMPDIR after compiling', async () => {
    const previous = mkdtempSync(join(tmpdir(), 'prior-tmp-'))
    process.env.TMPDIR = previous
    const source = mkdtempSync(join(tmpdir(), 'catalog-src-'))
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'catalog.sqlite')
    await compileCatalogDirectory(source, output)
    expect(process.env.TMPDIR).toBe(previous)
  })

  it('uses /dev/shm for catalog scratch when that tmpfs exists', () => {
    process.env.TEST_LOCALIZATION_SHM = '1'
    expect(catalogScratchDirectory()).toBe('/dev/shm')
    process.env.TEST_LOCALIZATION_SHM = '0'
    expect(catalogScratchDirectory()).not.toBe('/dev/shm')
  })

  it('compiles sqlite for Playwright only when the catalog file is missing', async () => {
    delete process.env.PLAYWRIGHT_TEST
    await ensurePlaywrightLocalizationSqlite()
    process.env.PLAYWRIGHT_TEST = 'true'
    const source = mkdtempSync(join(tmpdir(), 'catalog-src-'))
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'catalog.sqlite')
    await compileCatalogForProcess({ source, output })
    await ensurePlaywrightLocalizationSqlite()
    expect(process.env.LOCALIZATION_SQLITE_PATH).toBe(output)
    const missing = join(mkdtempSync(join(tmpdir(), 'missing-')), 'catalog.sqlite')
    await ensurePlaywrightLocalizationSqlite({ source, output: missing })
    expect(existsSync(missing)).toBe(true)
  })
})
