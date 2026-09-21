import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serializeCatalogTable } from '@vouchington/localization'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

const ORIGINAL_LOCALIZATION_SQLITE_PATH = process.env.LOCALIZATION_SQLITE_PATH
const ORIGINAL_PLAYWRIGHT_TEST = process.env.PLAYWRIGHT_TEST
const ORIGINAL_TEST_LOCALIZATION_SHM = process.env.TEST_LOCALIZATION_SHM
const ORIGINAL_TMPDIR = process.env.TMPDIR

function writeNormalizedCatalog(): string {
  const source = mkdtempSync(join(tmpdir(), 'catalog-src-'))
  mkdirSync(join(source, 'translations'))
  writeFileSync(
    join(source, 'copies.json'),
    serializeCatalogTable([{ id: 'copy.nav.home', descriptor: null }]),
  )
  writeFileSync(
    join(source, 'aliases.json'),
    serializeCatalogTable([{ consumer: 'web', alias: 'nav.home', copyId: 'copy.nav.home' }]),
  )
  writeFileSync(
    join(source, 'translations', 'en-US.json'),
    serializeCatalogTable([{ id: 'copy.nav.home', value: 'Home' }]),
  )
  return source
}

describe('compileCatalogDirectory', () => {
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
  it('compiles a normalized catalog directory and parses CLI flags', async () => {
    const source = writeNormalizedCatalog()
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'nested', 'catalog.sqlite')
    const revision = await compileCatalogDirectory(source, output)
    expect(revision).toMatch(/^[0-9a-f]+$/u)
    await expect(runCompileCli(['--source', source, '--output', output])).resolves.toBe(revision)
    await expect(runCompileCli(['--source'])).rejects.toThrow(/Missing value/)
    await expect(runCompileCli(['--output', ''])).rejects.toThrow(/Missing value/)
  })

  it('points LOCALIZATION_SQLITE_PATH at the compiled file', async () => {
    const source = writeNormalizedCatalog()
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
    const source = writeNormalizedCatalog()
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'catalog.sqlite')
    await compileCatalogDirectory(source, output)
    expect(process.env.TMPDIR).toBeUndefined()
  })

  it('restores a previously set TMPDIR after compiling', async () => {
    const previous = mkdtempSync(join(tmpdir(), 'prior-tmp-'))
    process.env.TMPDIR = previous
    const source = writeNormalizedCatalog()
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
    const source = writeNormalizedCatalog()
    const output = join(mkdtempSync(join(tmpdir(), 'compiled-')), 'catalog.sqlite')
    await compileCatalogForProcess({ source, output })
    await ensurePlaywrightLocalizationSqlite()
    expect(process.env.LOCALIZATION_SQLITE_PATH).toBe(output)
    const missing = join(mkdtempSync(join(tmpdir(), 'missing-')), 'catalog.sqlite')
    await ensurePlaywrightLocalizationSqlite({ source, output: missing })
    expect(existsSync(missing)).toBe(true)
  })

  it('is wired into Playwright and web-integration before the API starts', () => {
    expect(readFileSync('.github/workflows/tests-playwright.yml', 'utf8')).toContain('/dev/shm')
    expect(readFileSync('.github/workflows/tests-playwright-credentialed.yml', 'utf8')).toContain(
      '/dev/shm',
    )
    expect(readFileSync('backend/services/localization/compile-cli.mts', 'utf8')).toContain(
      'process.exit(0)',
    )
    expect(readFileSync('backend/entrypoints/api/serve.mts', 'utf8')).toContain(
      "'@services/localization/compile-catalog'",
    )
    expect(readFileSync('integration-tests/web/helpers/global-setup.mts', 'utf8')).toContain(
      'await compileCatalogForProcess()',
    )
  })
})
