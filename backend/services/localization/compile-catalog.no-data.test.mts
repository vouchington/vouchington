import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { catalogFromMessages } from '@vouchington/localization'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCompileCli } from './compile-catalog.mts'

const directories: string[] = []

function scratchDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'compile-catalog-'))
  directories.push(directory)
  return directory
}

function sourceDirectory(): string {
  const source = scratchDirectory()
  const catalog = catalogFromMessages([
    {
      id: 'nav.home',
      descriptor: null,
      consumers: ['web'],
      translations: { 'en-US': 'Owned compilation fixture' },
    },
  ])
  writeFileSync(join(source, 'copies.json'), JSON.stringify(catalog.copies))
  writeFileSync(join(source, 'aliases.json'), JSON.stringify(catalog.aliases))
  mkdirSync(join(source, 'translations'))
  for (const [locale, rows] of Object.entries(catalog.translations)) {
    writeFileSync(join(source, 'translations', `${locale}.json`), JSON.stringify(rows))
  }
  return source
}

async function expectCompiledCatalog(source: string, output: string): Promise<void> {
  const revision = await runCompileCli(['--source', source, '--output', output])
  vi.stubEnv('LOCALIZATION_SQLITE_PATH', resolve(output))
  vi.resetModules()
  const { getLocalizationDatabase } = await import('./database.mts')
  const { localizationBatchPayload } = await import('./resolve.mts')
  const database = getLocalizationDatabase()
  try {
    const payload = localizationBatchPayload({
      consumer: 'web',
      locales: ['en-US'],
      selectors: ['nav.home'],
    })
    expect(payload.revision).toBe(revision)
    expect(JSON.parse(payload.body).messages).toEqual({
      'nav.home': 'Owned compilation fixture',
    })
  } finally {
    database.close()
  }
}

describe('runCompileCli', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true })
  })

  it('compiles relative source and output paths into a readable runtime catalog and validates CLI flags', async () => {
    const source = relative(process.cwd(), sourceDirectory())
    const output = relative(process.cwd(), join(scratchDirectory(), 'nested', 'catalog.sqlite'))

    vi.spyOn(console, 'log').mockImplementation(() => {})

    await expectCompiledCatalog(source, output)

    expect(existsSync(dirname(resolve(output)))).toBe(true)
    await expect(runCompileCli(['--source'])).rejects.toThrow(/Missing value/)
    await expect(runCompileCli(['--output', ''])).rejects.toThrow(/Missing value/)
  })
})
