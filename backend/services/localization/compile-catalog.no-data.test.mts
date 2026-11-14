import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { catalogFromMessages } from '@vouchington/localization'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCompileCli } from './compile-catalog.mts'

const directories: string[] = []
const ORIGINAL_TMPDIR = process.env.TMPDIR

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
    if (ORIGINAL_TMPDIR === undefined) Reflect.deleteProperty(process.env, 'TMPDIR')
    else process.env.TMPDIR = ORIGINAL_TMPDIR
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true })
  })

  it('compiles relative source and output paths into a readable runtime catalog and validates CLI flags', async () => {
    const source = relative(process.cwd(), sourceDirectory())
    const output = relative(process.cwd(), join(scratchDirectory(), 'nested', 'catalog.sqlite'))

    const compilerTmpdirs: (string | undefined)[] = []
    vi.spyOn(console, 'log').mockImplementation(() => {
      compilerTmpdirs.push(process.env.TMPDIR)
    })

    await expectCompiledCatalog(source, output)

    expect(compilerTmpdirs).toEqual([dirname(resolve(output))])
    expect(existsSync(dirname(resolve(output)))).toBe(true)
    await expect(runCompileCli(['--source'])).rejects.toThrow(/Missing value/)
    await expect(runCompileCli(['--output', ''])).rejects.toThrow(/Missing value/)
    expect(process.env.TMPDIR).toBe(ORIGINAL_TMPDIR)
  })

  it('restores TMPDIR when the compiler fails', async () => {
    const source = sourceDirectory()
    const output = join(scratchDirectory(), 'nested', 'catalog.sqlite')
    const originalTmpdir = scratchDirectory()
    mkdirSync(output, { recursive: true })
    vi.stubEnv('TMPDIR', originalTmpdir)

    await expect(runCompileCli(['--source', source, '--output', output])).rejects.toThrow(Error)
    expect(process.env.TMPDIR).toBe(originalTmpdir)
  })

  it('restores an unset TMPDIR after compiling instead of the output directory', async () => {
    const source = sourceDirectory()
    const output = join(scratchDirectory(), 'catalog.sqlite')
    delete process.env.TMPDIR

    await expectCompiledCatalog(source, output)

    expect(process.env.TMPDIR).toBeUndefined()
  })

  it('restores a previously set TMPDIR after compiling', async () => {
    const previous = scratchDirectory()
    const source = sourceDirectory()
    const output = join(scratchDirectory(), 'catalog.sqlite')
    vi.stubEnv('TMPDIR', previous)

    await expectCompiledCatalog(source, output)

    expect(process.env.TMPDIR).toBe(previous)
  })
})
